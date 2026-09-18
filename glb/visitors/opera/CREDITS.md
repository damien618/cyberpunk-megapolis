# Theatre audience

Eight more distinct Mixamo characters, used only to fill the house for the
kabuki in the ship's theatre. They sit alongside the eight ballroom guests, so
the stalls are drawn from sixteen different models rather than one man cloned
down the row.

- Source: Adobe Mixamo character library, mirrored as GLB in the [Mixamo
  Animations and Characters](https://huggingface.co/datasets/tanish434/Mixamo-Animations-Characters)
  dataset (`character_refined_glb/`).
- Characters: Megan, Kate, Jody, James, Shannon, Josh, Olivia, Jones.
- Idle/walk clips: the same Mixamo skeleton clips the ballroom guests use
  (`../ballroom/mixamo-clips.glb`, from three.js `Xbot.glb`, Adobe Mixamo),
  retargeted at load.
- Licence: Mixamo characters and animations are royalty-free for personal and
  commercial projects (games, film, illustration). Do not redistribute the raw
  character files as a standalone stock pack.
- Local copies are texture-resized to 1024 and re-encoded (JPEG, or PNG where
  there is alpha) with `tools/shrink_glb_textures.py`, which takes each of
  these from 55–70 MB down to 2.5–4.3 MB.

These are the photoscanned ones on purpose. The first pass picked the smallest
files on the mirror instead, and small means stylised: the stalls filled up
with pink wigs and heads twice the size of a head, sitting next to a Mixamo
businessman.
