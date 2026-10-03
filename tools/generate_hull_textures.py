import math, os
from PIL import Image

W, H = 1024, 1024
NUM_STRAKES = 4
STRAKE_H = H // NUM_STRAKES  # 256 px per strake

def generate_hull_textures():
    diffuse = Image.new('RGB', (W, H))
    normal = Image.new('RGB', (W, H))
    roughness = Image.new('RGB', (W, H))
    
    diff_pix = diffuse.load()
    norm_pix = normal.load()
    rough_pix = roughness.load()
    
    height = [[0.0 for _ in range(W)] for _ in range(H)]
    
    # Deterministic pseudo-random generator
    def prng(seed):
        s = seed
        while True:
            s = (s * 1664525 + 1013904223) & 0xFFFFFFFF
            yield s / 4294967296.0

    rand_gen = prng(104729)
    def rand():
        return next(rand_gen)
    
    # Subtle plate tonality differences:
    # Classic luxury ocean liner navy blue: deep rich navy ~ rgb(26, 48, 72)
    plate_colors = []
    for row in range(NUM_STRAKES):
        row_colors = []
        for col in range(2):
            dr = int((rand() - 0.5) * 10)
            dg = int((rand() - 0.5) * 12)
            db = int((rand() - 0.5) * 16)
            r = max(20, min(34, 27 + dr))
            g = max(40, min(58, 49 + dg))
            b = max(62, min(86, 73 + db))
            row_colors.append((r, g, b))
        plate_colors.append(row_colors)

    # First pass: build 2D height field
    for y in range(H):
        row = y // STRAKE_H
        vy = y % STRAKE_H
        x_seam = (W // 2) if (row % 2 == 1) else 0
        dy_seam = min(vy, STRAKE_H - vy)
        
        for x in range(W):
            dist_x = abs(x - x_seam)
            dx_seam = min(dist_x, W - dist_x)
            
            vx = (x - x_seam + W) % W
            col = 0 if vx < (W // 2) else 1
            
            # 1. Plate pillowing (convex "oil-canning" curvature between frame stiffeners)
            u_pillow = math.sin((vx / W) * math.pi)
            v_pillow = math.sin((vy / STRAKE_H) * math.pi)
            h = u_pillow * v_pillow * 0.22
            
            # 2. Horizontal strake seam: groove + raised central weld bead
            if dy_seam < 8:
                groove = math.cos((dy_seam / 8.0) * (math.pi / 2.0))
                h -= groove * 0.35
                if dy_seam <= 2:
                    bead = math.cos((dy_seam / 2.0) * (math.pi / 2.0))
                    h += bead * 0.26
            
            # 3. Vertical butt seam: groove + raised central weld bead
            if dx_seam < 8:
                groove = math.cos((dx_seam / 8.0) * (math.pi / 2.0))
                h -= groove * 0.35
                if dx_seam <= 2:
                    bead = math.cos((dx_seam / 2.0) * (math.pi / 2.0))
                    h += bead * 0.26
            
            # 4. Rivet row along horizontal lap (at vy = 16)
            rivet_spacing = 32
            rx = ((x + rivet_spacing // 2) // rivet_spacing) * rivet_spacing
            dr = math.hypot(x - rx, vy - 16)
            if dr < 4.2 and dx_seam > 8:
                rivet_h = math.sqrt(max(0.0, 1.0 - (dr / 4.2)**2)) * 0.42
                h += rivet_h
                
            # 5. Scupper drainage slots (at deck level vy = 218 in strake 0)
            if row == 0 and abs(vy - 218) < 6:
                scupper_spacing = 256
                sx = ((x + scupper_spacing // 2) // scupper_spacing) * scupper_spacing
                if abs(x - sx) < 16:
                    h -= 0.30
            
            # 6. Micro paint texture / orange-peel chatter
            chatter = (rand() - 0.5) * 0.025
            h += chatter
            
            height[y][x] = h

    # Second pass: compute normal map, diffuse color, and roughness
    norm_scale = 11.5
    for y in range(H):
        y_prev = (y - 1 + H) % H
        y_next = (y + 1) % H
        row = y // STRAKE_H
        vy = y % STRAKE_H
        x_seam = (W // 2) if (row % 2 == 1) else 0
        dy_seam = min(vy, STRAKE_H - vy)

        for x in range(W):
            x_prev = (x - 1 + W) % W
            x_next = (x + 1) % W
            
            dist_x = abs(x - x_seam)
            dx_seam = min(dist_x, W - dist_x)
            
            # Normal calculation from central difference
            dh_dx = (height[y][x_next] - height[y][x_prev]) * 0.5
            dh_dy = (height[y_next][x] - height[y_prev][x]) * 0.5
            
            nx = -dh_dx * norm_scale
            ny = dh_dy * norm_scale  # V points down in image, up in UV
            nz = math.sqrt(max(0.02, 1.0 - nx * nx - ny * ny))
            
            inv_len = 1.0 / math.sqrt(nx * nx + ny * ny + nz * nz)
            nx *= inv_len
            ny *= inv_len
            nz *= inv_len
            
            r_norm = int(round((nx * 0.5 + 0.5) * 255))
            g_norm = int(round((ny * 0.5 + 0.5) * 255))
            b_norm = int(round((nz * 0.5 + 0.5) * 255))
            norm_pix[x, y] = (r_norm, g_norm, b_norm)
            
            # --- Diffuse Color ---
            vx = (x - x_seam + W) % W
            col = 0 if vx < (W // 2) else 1
            base_r, base_g, base_b = plate_colors[row][col]
            
            pillow_factor = (math.sin((vx / W) * math.pi) * 
                             math.sin((vy / STRAKE_H) * math.pi)) * 0.08
            
            cr = base_r * (1.0 + pillow_factor)
            cg = base_g * (1.0 + pillow_factor)
            cb = base_b * (1.0 + pillow_factor)
            
            # Faint natural drainage streaks
            wash = math.sin(x * 0.22 + row * 1.5) * 0.03 + math.sin(x * 0.035) * 0.04
            if wash < 0:
                cr *= (1.0 + wash * 0.4)
                cg *= (1.0 + wash * 0.4)
                cb *= (1.0 + wash * 0.4)
            
            # Seam shading
            if dy_seam < 6:
                if dy_seam <= 1:
                    cr = min(255, cr + 20)
                    cg = min(255, cg + 26)
                    cb = min(255, cb + 34)
                else:
                    cr *= 0.68
                    cg *= 0.68
                    cb *= 0.68
            elif dx_seam < 6:
                if dx_seam <= 1:
                    cr = min(255, cr + 18)
                    cg = min(255, cg + 24)
                    cb = min(255, cb + 30)
                else:
                    cr *= 0.70
                    cg *= 0.70
                    cb *= 0.70
            
            # Rivet shading
            rivet_spacing = 32
            rx = ((x + rivet_spacing // 2) // rivet_spacing) * rivet_spacing
            dr = math.hypot(x - rx, vy - 16)
            if dr < 3.8 and dx_seam > 8:
                if vy < 16:
                    cr = min(255, cr + 30)
                    cg = min(255, cg + 36)
                    cb = min(255, cb + 46)
                else:
                    cr *= 0.68
                    cg *= 0.68
                    cb *= 0.68
            
            # Scupper shading
            if row == 0 and abs(vy - 218) < 6:
                scupper_spacing = 256
                sx = ((x + scupper_spacing // 2) // scupper_spacing) * scupper_spacing
                if abs(x - sx) < 16:
                    cr *= 0.4
                    cg *= 0.4
                    cb *= 0.4

            diff_pix[x, y] = (int(min(255, max(0, cr))), 
                              int(min(255, max(0, cg))), 
                              int(min(255, max(0, cb))))
            
            # --- Roughness ---
            rough = 0.44
            rough -= pillow_factor * 0.6
            if dy_seam < 6 or dx_seam < 6:
                rough += 0.16
            if dr < 4.2 and dx_seam > 8:
                rough += 0.08
            if row == 0 and abs(vy - 218) < 6 and abs(x - ((x + 128) // 256) * 256) < 16:
                rough += 0.3
            
            rough_val = int(min(255, max(0, rough * 255)))
            rough_pix[x, y] = (rough_val, rough_val, rough_val)

    os.makedirs('textures/cruise', exist_ok=True)
    diffuse.save('textures/cruise/hull_plate_diffuse.webp', 'WEBP', quality=95)
    normal.save('textures/cruise/hull_plate_normal.webp', 'WEBP', lossless=True)
    roughness.save('textures/cruise/hull_plate_roughness.webp', 'WEBP', quality=90)
    print('Cruise hull textures generated in textures/cruise/ successfully!')

if __name__ == '__main__':
    generate_hull_textures()

