#!/usr/bin/env python3
"""Cut a GLB's embedded textures down to web size, in place of a toolchain.

The ballroom guests were brought in this way and the note in their CREDITS.md
says so: a Mixamo character off the mirror carries 4 K PNGs and weighs fifty
megabytes, which is not a thing to put on a page that already loads a liner.
Nothing here understands glTF beyond the two things that matter — where the
images are and which bufferViews point at them — so it is safe to run on any
binary glTF and it leaves everything else byte for byte.

    python3 tools/shrink_glb_textures.py in.glb out.glb [--max 1024] [-q 85]
"""
import argparse
import io
import json
import struct
import sys
from pathlib import Path

from PIL import Image

JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def read_glb(path):
    data = Path(path).read_bytes()
    magic, version, _length = struct.unpack_from('<III', data, 0)
    if magic != 0x46546C67:
        raise SystemExit(f'{path}: not a GLB')
    off, js, binary = 12, None, b''
    while off < len(data):
        clen, ctype = struct.unpack_from('<II', data, off)
        chunk = data[off + 8:off + 8 + clen]
        if ctype == JSON_CHUNK:
            js = json.loads(chunk.decode('utf-8'))
        elif ctype == BIN_CHUNK:
            binary = chunk
        off += 8 + clen + (-clen % 4)
    return js, binary


def write_glb(path, js, binary):
    jb = json.dumps(js, separators=(',', ':')).encode('utf-8')
    jb += b' ' * (-len(jb) % 4)
    binary += b'\0' * (-len(binary) % 4)
    total = 12 + 8 + len(jb) + 8 + len(binary)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(jb), JSON_CHUNK))
        f.write(jb)
        f.write(struct.pack('<II', len(binary), BIN_CHUNK))
        f.write(binary)


def shrink(src, dst, max_side=1024, quality=85):
    js, binary = read_glb(src)
    views = js.get('bufferViews', [])
    images = js.get('images', [])
    if not images:
        Path(dst).write_bytes(Path(src).read_bytes())
        return 0, 0

    # Every bufferView that is NOT an image is copied through untouched; the
    # image ones are re-encoded and appended at the end, and their views are
    # repointed. Accessors never reference an image view, so nothing else has
    # to move.
    image_views = {im['bufferView'] for im in images if 'bufferView' in im}
    out = bytearray()
    new_views = []
    for i, v in enumerate(views):
        if i in image_views:
            new_views.append(dict(v))               # filled in below
            continue
        start = v.get('byteOffset', 0)
        blob = binary[start:start + v['byteLength']]
        while len(out) % 4:
            out.append(0)
        nv = dict(v)
        nv['byteOffset'] = len(out)
        nv['byteLength'] = len(blob)
        new_views.append(nv)
        out += blob

    for im in images:
        if 'bufferView' not in im:
            continue
        vi = im['bufferView']
        v = views[vi]
        start = v.get('byteOffset', 0)
        raw = bytes(binary[start:start + v['byteLength']])
        img = Image.open(io.BytesIO(raw))
        img.load()
        w, h = img.size
        scale = min(1.0, max_side / max(w, h))
        if scale < 1.0:
            img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))),
                             Image.LANCZOS)
        buf = io.BytesIO()
        # Alpha has to survive — it is what cuts out hair cards and eyelashes.
        if img.mode in ('RGBA', 'LA', 'P') and (
                img.mode != 'P' or 'transparency' in img.info):
            img.convert('RGBA').save(buf, format='PNG', optimize=True)
            mime = 'image/png'
        else:
            img.convert('RGB').save(buf, format='JPEG', quality=quality,
                                    optimize=True, progressive=True)
            mime = 'image/jpeg'
        blob = buf.getvalue()
        while len(out) % 4:
            out.append(0)
        new_views[vi] = {'buffer': 0, 'byteOffset': len(out),
                         'byteLength': len(blob)}
        out += blob
        im['mimeType'] = mime

    js['bufferViews'] = new_views
    js['buffers'] = [{'byteLength': len(out)}]
    write_glb(dst, js, bytes(out))
    return Path(src).stat().st_size, Path(dst).stat().st_size


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--max', type=int, default=1024)
    ap.add_argument('-q', '--quality', type=int, default=85)
    a = ap.parse_args()
    before, after = shrink(a.src, a.dst, a.max, a.quality)
    print(f'{Path(a.src).name}: {before / 1e6:.1f} MB -> {after / 1e6:.1f} MB',
          file=sys.stderr)
