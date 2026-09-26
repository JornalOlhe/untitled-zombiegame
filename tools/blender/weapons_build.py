# Dead Recoil — voxel weapon builder for Blender (5.x).
#
# Builds the 21 weapons from the "WEAPON UV TEMPLATES" sheets: every part is a box whose six
# faces get their own island in a pixel-art atlas (80 px per metre, Minecraft-skin style), painted
# with the part's material pattern (panel metal, wood grain, grip stipple, camo, blood, bands,
# glow strips and energy cells). Glowing pixels also go to an emission atlas.
#
# Coordinates are the game's viewmodel frame: x right, y up, -z forward (muzzle), grip near z=0.
# Nodes named "mag" and "pump" are exported as separate objects so the game can animate them.
#
# Run inside Blender: set OUT_DIR, then exec this file. Writes <slug>.glb and <slug>.png previews.
import bpy, bmesh, math, os, json, random, zlib
import numpy as np
from mathutils import Matrix, Vector, Euler

OUT_DIR = globals().get("OUT_DIR", os.path.join(os.path.expanduser("~"), "dr_weapons"))
ONLY = globals().get("ONLY")  # optional list of slugs
RENDER = globals().get("RENDER", True)
PPM = 80  # pixels per metre

# ---------------------------------------------------------------- palette (sRGB 0..1)
BLK = (0.11, 0.115, 0.125)
DGR = (0.2, 0.21, 0.225)
GRY = (0.42, 0.44, 0.46)
STL = (0.66, 0.68, 0.7)
WOOD = (0.47, 0.3, 0.16)
DWOOD = (0.31, 0.19, 0.11)
RED = (0.68, 0.09, 0.08)
DRED = (0.4, 0.05, 0.05)
TAN = (0.66, 0.56, 0.38)
OLIVE = (0.36, 0.37, 0.22)
GOLD = (0.86, 0.66, 0.2)
WHITE = (0.86, 0.87, 0.88)
BRASS = (0.82, 0.63, 0.26)
STRING = (0.85, 0.82, 0.74)
G_RED = (1.0, 0.16, 0.1)
G_ORANGE = (1.0, 0.52, 0.12)
G_PURPLE = (0.72, 0.28, 1.0)
G_BLUE = (0.22, 0.62, 1.0)
G_ICE = (0.6, 0.92, 1.0)
G_GOLD = (1.0, 0.85, 0.35)


def S(p="metal", c=DGR, c2=None, g=None, **kw):
    d = dict(p=p if isinstance(p, (list, tuple)) else [p], c=c, c2=c2, g=g)
    d.update(kw)
    return d


# ---------------------------------------------------------------- weapon definitions
class W:
    def __init__(self, slug, name):
        self.slug, self.name, self.parts = slug, name, []

    def box(self, c, s, st, rot=(0, 0, 0), node="body"):
        self.parts.append(dict(c=c, s=s, st=st, rot=rot, node=node))
        return self

    def link(self, p0, p1, t, h, st, node="body"):
        """Box from p0 to p1 in the horizontal plane (rotation about y), thickness t, height h."""
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        ang = math.degrees(math.atan2(d.x, d.z))
        c = (p0 + p1) / 2
        return self.box(tuple(c), (t, h, d.length), st, rot=(0, ang, 0), node=node)

    def vlink(self, p0, p1, t, d_, st, node="body"):
        """Box from p0 to p1 in the vertical xy plane (rotation about z), thickness t, depth d_."""
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        ang = math.degrees(math.atan2(-d.x, d.y))
        c = (p0 + p1) / 2
        return self.box(tuple(c), (t, d.length, d_), st, rot=(0, 0, ang), node=node)


def pistol_grip(w, st, z=0.0, y=-0.085, tilt=-16):
    w.box((0, y, z), (0.052, 0.15, 0.064), st, rot=(tilt, 0, 0))
    w.box((0, -0.035, z - 0.075), (0.026, 0.018, 0.085), S("metal", BLK))  # trigger guard
    w.box((0, -0.028, z - 0.052), (0.008, 0.03, 0.01), S("metal", GRY))  # trigger


def details_rifle(w, z_port=-0.2, y_top=0.086, side_x=0.04, rail=True):
    """Ejection port, charging handle, screws, sling loop: the small parts that sell a rifle."""
    w.box((side_x, 0.045, z_port), (0.006, 0.03, 0.09), S("metal", (0.06, 0.06, 0.065)))
    w.box((side_x + 0.004, 0.06, z_port + 0.07), (0.012, 0.012, 0.02), S("metal", GRY))
    for dz in (-0.12, 0.08):
        w.box((side_x, 0.0, z_port + dz), (0.005, 0.012, 0.012), S("metal", STL))
        w.box((-side_x, 0.0, z_port + dz), (0.005, 0.012, 0.012), S("metal", STL))
    w.box((-side_x, 0.02, z_port + 0.2), (0.008, 0.02, 0.03), S("metal", BLK))
    if rail:
        for i in range(6):
            w.box((0, y_top + 0.006, z_port - 0.18 + i * 0.045), (0.036, 0.008, 0.012), S("metal", BLK))


WEAPONS = []

# 01 Machete ----------------------------------------------------------------
w = W("machete", "Machete")
blade = S(["metal", "blood"], STL, blood=0.22, edge=(0.85, 0.87, 0.88))
w.box((0.02, 0.4, -0.23), (0.11, 0.7, 0.02), blade, rot=(0, 0, -7))
w.box((0.055, 0.78, -0.23), (0.07, 0.07, 0.02), blade, rot=(0, 0, -7))
w.box((0.07, 0.83, -0.23), (0.035, 0.04, 0.018), blade, rot=(0, 0, -7))
w.box((0, 0.025, -0.23), (0.15, 0.03, 0.05), S("metal", BLK))
w.box((0, -0.13, -0.23), (0.05, 0.27, 0.05), S(["wood", "bands"], WOOD, BLK, step=10, bw=2))
w.box((0, -0.275, -0.23), (0.058, 0.03, 0.058), S("metal", BLK))
WEAPONS.append(w)

# 02 MP5 --------------------------------------------------------------------
w = W("mp5", "MP5")
w.box((0, 0.03, -0.22), (0.074, 0.11, 0.42), S(["panel", "dots"], BLK, g=G_RED, dotc=RED))
w.box((0, 0.098, -0.24), (0.03, 0.026, 0.34), S("grip", DGR))
w.box((0, 0.122, -0.03), (0.05, 0.035, 0.03), S("metal", BLK))
w.box((0, 0.122, -0.5), (0.028, 0.045, 0.028), S("metal", BLK))
w.box((0, 0.068, -0.44), (0.04, 0.04, 0.14), S("metal", DGR))
w.box((0, 0.02, -0.52), (0.086, 0.09, 0.2), S("grip", DGR))
w.box((0, 0.035, -0.7), (0.03, 0.03, 0.18), S("metal", GRY))
w.box((0, 0.035, -0.8), (0.042, 0.042, 0.045), S("panel", BLK))
pistol_grip(w, S("grip", BLK), z=0.0)
w.box((0, -0.13, -0.2), (0.044, 0.2, 0.07), S(["panel", "tip"], BLK, tipc=BRASS), rot=(20, 0, 0), node="mag")
w.box((0, 0.03, 0.08), (0.05, 0.075, 0.06), S("metal", BLK))
w.box((0, 0.01, 0.2), (0.022, 0.04, 0.2), S("metal", BLK))
w.box((0, -0.005, 0.31), (0.05, 0.12, 0.03), S("grip", BLK))
details_rifle(w, z_port=-0.18, rail=False)
w.box((0.032, 0.02, -0.52), (0.028, 0.05, 0.14), S("vents", DGR))
w.box((-0.032, 0.02, -0.52), (0.028, 0.05, 0.14), S("vents", DGR))
w.box((0.04, -0.012, -0.08), (0.008, 0.02, 0.03), S("cell", RED, g=G_RED))
WEAPONS.append(w)

# 03 Bow ---------------------------------------------------------------------
def bow_limbs(w, st, tip_st, string_st, kinks=((0.16, -0.26), (0.28, -0.4), (0.34, -0.52)), h=0.03):
    for side in (-1, 1):
        prev = (side * 0.02, 0.02, -0.2)
        for kx, kz in kinks:
            nxt = (side * kx, 0.02, kz)
            w.link(prev, nxt, 0.026, h, st)
            prev = nxt
        w.box((side * kinks[-1][0], 0.02, kinks[-1][1]), (0.034, h + 0.016, 0.034), tip_st)
    w.link((-kinks[-1][0], 0.02, kinks[-1][1]), (kinks[-1][0], 0.02, kinks[-1][1]), 0.006, 0.006, string_st)


w = W("bow", "Bow")
bow_limbs(w, S(["wood", "bands"], WOOD, BLK, step=14, bw=2), S("metal", BLK), S("metal", STRING))
w.box((0, 0.02, -0.2), (0.046, 0.16, 0.16), S(["grip"], BLK))
w.box((0, 0.02, -0.2), (0.05, 0.06, 0.1), S("wood", DWOOD))
WEAPONS.append(w)

# 04 Riot Breaker -------------------------------------------------------------
w = W("riot_breaker", "Riot Breaker")
w.box((0, 0.03, -0.2), (0.08, 0.11, 0.36), S(["panel", "dots"], BLK, dotc=RED, g=G_RED))
w.box((0, 0.058, -0.68), (0.046, 0.046, 0.62), S("metal", DGR))
w.box((0, 0.0, -0.62), (0.04, 0.04, 0.5), S("metal", BLK))
w.box((0, 0.09, -0.97), (0.014, 0.016, 0.014), S("metal", STL))
w.box((0, -0.004, -0.52), (0.074, 0.066, 0.18), S(["wood", "grooves"], WOOD), node="pump")
pistol_grip(w, S("wood", WOOD), z=-0.02, tilt=-20)
w.box((0, -0.005, 0.12), (0.068, 0.11, 0.3), S("wood", WOOD))
w.box((0, -0.025, 0.28), (0.074, 0.15, 0.03), S("grip", BLK))
w.box((0.046, 0.03, -0.2), (0.012, 0.05, 0.15), S("bands", RED, BRASS, step=5, bw=2, axis="u"))
w.box((0, 0.086, -0.62), (0.054, 0.02, 0.36), S("vents", BLK))
details_rifle(w, z_port=-0.16, rail=False)
WEAPONS.append(w)

# 05 Crimson AK --------------------------------------------------------------
w = W("crimson_ak", "Crimson AK")
w.box((0, 0.05, -0.22), (0.078, 0.066, 0.44), S(["panel", "scratch"], RED))
w.box((0, -0.008, -0.2), (0.074, 0.05, 0.36), S(["panel"], BLK))
details_rifle(w, z_port=-0.2, rail=False)
w.box((0, 0.026, -0.46), (0.07, 0.04, 0.03), S("metal", BLK))
w.box((0, 0.09, -0.2), (0.07, 0.02, 0.36), S("panel", BLK))
w.box((0, 0.024, -0.55), (0.084, 0.09, 0.24), S(["vents"], RED))
for dz in (-0.47, -0.63):
    w.box((0, 0.024, dz), (0.09, 0.096, 0.016), S("metal", BLK))
w.box((0, 0.08, -0.55), (0.04, 0.034, 0.24), S("metal", BLK))
w.box((0, 0.03, -0.8), (0.03, 0.03, 0.26), S("metal", GRY))
w.box((0, 0.03, -0.95), (0.046, 0.046, 0.06), S("panel", BLK))
w.box((0, 0.075, -0.86), (0.02, 0.05, 0.02), S("metal", BLK))
pistol_grip(w, S("grip", BLK), z=0.0)
w.box((0, -0.14, -0.22), (0.046, 0.22, 0.08), S(["panel", "tip"], BLK, tipc=G_ORANGE), rot=(26, 0, 0), node="mag")
w.box((0, 0.0, 0.18), (0.06, 0.11, 0.3), S(["panel", "scratch"], RED), rot=(-4, 0, 0))
w.box((0, -0.012, 0.335), (0.064, 0.13, 0.02), S("grip", BLK))
WEAPONS.append(w)

# 06 Firestarter ---------------------------------------------------------------
w = W("firestarter", "Firestarter")
w.box((0, 0.03, -0.3), (0.12, 0.13, 0.5), S(["panel", "bands"], RED, BLK, step=16, bw=3))
w.box((0, 0.03, -0.72), (0.06, 0.06, 0.34), S("panel", BLK))
w.box((0, 0.03, -0.92), (0.085, 0.085, 0.05), S("cell", BLK, g=G_ORANGE))
w.box((0, 0.03, -0.955), (0.05, 0.05, 0.02), S("cell", G_ORANGE, g=G_ORANGE))
w.box((0, -0.075, -0.62), (0.036, 0.1, 0.04), S("grip", BLK))
pistol_grip(w, S("grip", BLK), z=0.0)
w.box((0, -0.085, -0.38), (0.08, 0.08, 0.26), S("bands", RED, BLK, step=7, bw=2, axis="u"), node="mag")
w.box((0, 0.02, 0.15), (0.07, 0.11, 0.22), S("panel", BLK))
WEAPONS.append(w)

# 07 Wraith M4A1 ---------------------------------------------------------------
w = W("wraith_m4a1", "Wraith M4A1")
camo = S(["camo", "panel"], TAN, BLK, camo=0.35)
w.box((0, 0.05, -0.2), (0.074, 0.07, 0.4), camo)
w.box((0, -0.01, -0.2), (0.07, 0.07, 0.3), camo)
w.box((0, 0.098, -0.32), (0.034, 0.026, 0.5), S("grip", BLK))
w.box((0, 0.126, -0.05), (0.03, 0.03, 0.05), S("metal", BLK))
w.box((0, 0.035, -0.56), (0.086, 0.09, 0.28), S(["camo", "grooves"], TAN, BLK, camo=0.3))
w.box((0, 0.035, -0.8), (0.028, 0.028, 0.22), S("metal", BLK))
w.box((0, 0.035, -0.93), (0.04, 0.04, 0.05), S("panel", BLK))
w.box((0, 0.1, -0.72), (0.02, 0.07, 0.02), S("metal", BLK))
pistol_grip(w, S("grip", BLK), z=0.02, tilt=-18)
w.box((0, -0.12, -0.2), (0.044, 0.18, 0.078), S(["panel", "tip"], BLK, tipc=BRASS), rot=(12, 0, 0), node="mag")
w.box((0, 0.04, 0.1), (0.034, 0.034, 0.2), S("metal", BLK))
w.box((0, 0.012, 0.2), (0.06, 0.1, 0.18), camo)
w.box((0, 0.0, 0.3), (0.064, 0.14, 0.024), S("grip", BLK))
details_rifle(w, z_port=-0.16, rail=False)
w.box((0.042, 0.04, -0.04), (0.012, 0.02, 0.03), S("metal", BLK))
w.box((0, 0.0, -0.52), (0.03, 0.04, 0.12), S("grip", BLK))
WEAPONS.append(w)

# 08 Bloodfang (knife) -----------------------------------------------------------
w = W("bloodfang", "Bloodfang")
bl = S(["metal", "blood"], STL, blood=0.42)
w.box((0.02, 0.22, -0.23), (0.12, 0.38, 0.022), bl, rot=(0, 0, -7))
w.box((0.05, 0.43, -0.23), (0.08, 0.06, 0.02), bl, rot=(0, 0, -7))
w.box((0.066, 0.475, -0.23), (0.04, 0.035, 0.018), bl, rot=(0, 0, -7))
for i in range(4):
    w.box((-0.048 + i * 0.004, 0.12 + i * 0.075, -0.23), (0.024, 0.03, 0.02), bl, rot=(0, 0, 38))
w.box((0, 0.022, -0.23), (0.17, 0.035, 0.06), S("panel", BLK))
w.box((0, -0.1, -0.23), (0.052, 0.2, 0.052), S(["wood", "bands"], DWOOD, BLK, step=8, bw=2))
w.box((0, -0.21, -0.23), (0.06, 0.03, 0.06), S("metal", DRED))
WEAPONS.append(w)

# 09 Titanbreaker ------------------------------------------------------------------
w = W("titanbreaker", "Titanbreaker")
w.box((0, 0.03, -0.25), (0.09, 0.12, 0.5), S(["panel", "stripe"], BLK, TAN))
w.box((0, 0.04, -0.8), (0.046, 0.046, 0.6), S("metal", DGR))
w.box((0, 0.04, -1.12), (0.08, 0.06, 0.09), S(["panel", "vents"], BLK))
w.box((0, 0.145, -0.25), (0.06, 0.06, 0.34), S("panel", BLK))
w.box((0, 0.145, -0.43), (0.072, 0.072, 0.03), S("cell", BLK, g=G_RED))
w.box((0, 0.145, -0.065), (0.066, 0.066, 0.03), S("metal", DGR))
for z in (-0.18, -0.32):
    w.box((0, 0.1, z), (0.026, 0.032, 0.026), S("metal", BLK))
for x in (-0.028, 0.028):
    w.box((x, 0.0, -0.74), (0.014, 0.014, 0.2), S("metal", BLK))
pistol_grip(w, S("grip", BLK), z=0.0)
w.box((0, -0.1, -0.22), (0.06, 0.14, 0.1), S(["bands"], BLK, TAN, step=9, bw=2, axis="v"), node="mag")
w.box((0, 0.01, 0.2), (0.07, 0.12, 0.34), S(["panel"], TAN))
w.box((0, 0.082, 0.18), (0.05, 0.03, 0.16), S("grip", BLK))
w.box((0, -0.01, 0.38), (0.076, 0.16, 0.03), S("grip", BLK))
WEAPONS.append(w)

# 10 Cerberus Laser ------------------------------------------------------------------
w = W("cerberus_laser", "Cerberus Laser")
w.box((0, 0.03, -0.35), (0.12, 0.13, 0.6), S(["panel", "glowline"], BLK, g=G_RED))
for x, y in ((-0.042, 0.005), (0.0, 0.058), (0.042, 0.005)):
    w.box((x, y, -0.8), (0.032, 0.032, 0.3), S("panel", DGR))
    w.box((x, y, -0.965), (0.038, 0.038, 0.03), S("cell", BLK, g=G_RED))
w.box((0, 0.11, -0.3), (0.04, 0.03, 0.3), S("grip", BLK))
pistol_grip(w, S("grip", BLK), z=0.0)
w.box((0, -0.075, -0.26), (0.07, 0.07, 0.16), S("cell", DGR, g=G_BLUE), node="mag")
w.box((0, 0.02, 0.17), (0.08, 0.12, 0.26), S(["panel", "glowline"], BLK, g=G_RED))
WEAPONS.append(w)

# 11 Frostbite ---------------------------------------------------------------------
w = W("frostbite", "Frostbite")
w.box((0, 0.03, -0.35), (0.13, 0.14, 0.55), S(["panel", "glowline"], WHITE, g=G_ICE))
w.box((0, 0.125, -0.35), (0.07, 0.055, 0.3), S("cell", DGR, g=G_BLUE))
w.box((0, 0.03, -0.75), (0.06, 0.06, 0.25), S("panel", GRY))
w.box((0, 0.03, -0.9), (0.085, 0.085, 0.05), S("cell", DGR, g=G_ICE))
pistol_grip(w, S("grip", BLK), z=0.0)
w.box((0, -0.095, -0.24), (0.05, 0.12, 0.08), S("cell", DGR, g=G_BLUE), node="mag")
w.box((0, 0.02, 0.16), (0.08, 0.12, 0.24), S("panel", WHITE))
WEAPONS.append(w)

# 12 Stormpiercer ---------------------------------------------------------------------
w = W("stormpiercer", "Stormpiercer")
bow_limbs(w, S(["panel", "glowline"], BLK, g=G_PURPLE), S("cell", BLK, g=G_PURPLE), S("cell", G_PURPLE, g=G_PURPLE),
          kinks=((0.12, -0.22), (0.24, -0.34), (0.3, -0.46), (0.35, -0.54)), h=0.034)
w.box((0, 0.02, -0.2), (0.05, 0.17, 0.16), S(["grip"], BLK))
w.box((0, 0.02, -0.28), (0.03, 0.04, 0.03), S("cell", BLK, g=G_PURPLE))
WEAPONS.append(w)

# 13 Thundergrave -------------------------------------------------------------------------
w = W("thundergrave", "Thundergrave")
w.box((0, 0.03, -0.35), (0.12, 0.13, 0.62), S(["panel", "glowline"], BLK, g=G_ORANGE))
for side in (-1, 1):
    w.box((side * 0.078, 0.03, -0.76), (0.034, 0.12, 0.5), S(["panel", "glowline"], DGR, g=G_ORANGE))
w.box((0, 0.03, -0.74), (0.032, 0.032, 0.52), S("cell", DGR, g=G_ORANGE))
w.box((0, 0.13, -0.2), (0.05, 0.05, 0.2), S("panel", BLK))
pistol_grip(w, S("grip", BLK), z=0.0)
w.box((0, -0.085, -0.26), (0.07, 0.08, 0.12), S("cell", BLK, g=G_ORANGE), node="mag")
w.box((0, 0.02, 0.17), (0.08, 0.12, 0.26), S(["panel", "stripe"], DGR, TAN))
WEAPONS.append(w)

# 14 Doomsday Launcher ---------------------------------------------------------------------
w = W("doomsday_launcher", "Doomsday Launcher")
w.box((0, 0.05, -0.35), (0.17, 0.17, 1.0), S(["camo", "bands"], OLIVE, RED, camo=0.22, cc=(0.28, 0.29, 0.17), c3=(0.44, 0.42, 0.28), step=26, bw=3, axis="u"))
w.box((0, 0.05, -0.87), (0.2, 0.2, 0.06), S("panel", BLK))
w.box((0, 0.05, 0.17), (0.2, 0.2, 0.06), S("panel", BLK))
w.box((0, 0.05, -0.905), (0.1, 0.1, 0.02), S("cell", RED, g=None))
w.box((-0.11, 0.1, -0.35), (0.03, 0.08, 0.1), S("panel", BLK))
w.box((-0.11, 0.12, -0.3), (0.02, 0.02, 0.02), S("cell", BLK, g=G_RED))
pistol_grip(w, S("grip", BLK), z=-0.1, y=-0.1)
w.box((0, -0.09, -0.46), (0.045, 0.12, 0.05), S("grip", BLK))
WEAPONS.append(w)

# 15 Widowmaker --------------------------------------------------------------------------
w = W("widowmaker", "Widowmaker")
w.box((0, 0.03, -0.22), (0.1, 0.12, 0.42), S(["panel", "glowline"], BLK, g=G_PURPLE))
w.box((0, 0.058, -0.72), (0.056, 0.056, 0.62), S(["panel", "glowline"], DGR, g=G_PURPLE))
w.box((0, 0.0, -0.62), (0.044, 0.044, 0.5), S("metal", BLK))
w.box((0, 0.058, -1.04), (0.07, 0.07, 0.04), S("cell", BLK, g=G_PURPLE))
w.box((0, -0.004, -0.52), (0.086, 0.072, 0.18), S(["grip", "gem"], BLK, g=G_PURPLE), node="pump")
pistol_grip(w, S("grip", BLK), z=-0.02, tilt=-20)
w.box((0, 0.0, 0.14), (0.07, 0.12, 0.3), S(["panel", "glowline"], BLK, g=G_PURPLE))
w.box((0.056, 0.03, -0.2), (0.012, 0.05, 0.15), S("bands", RED, GOLD, step=5, bw=2, axis="u"))
WEAPONS.append(w)

# 16 Quantum Annihilator -------------------------------------------------------------------
w = W("quantum_annihilator", "Quantum Annihilator")
w.box((0, 0.03, -0.33), (0.13, 0.14, 0.56), S(["panel", "glowline"], BLK, g=G_BLUE))
w.box((0, 0.105, -0.45), (0.1, 0.07, 0.16), S("cell", DGR, g=G_BLUE))
w.box((0, 0.03, -0.75), (0.1, 0.1, 0.28), S(["panel", "glowline"], DGR, g=G_BLUE))
w.box((0, 0.03, -0.905), (0.12, 0.12, 0.04), S("cell", BLK, g=G_BLUE))
pistol_grip(w, S("grip", BLK), z=0.0)
w.box((0, -0.09, -0.26), (0.06, 0.09, 0.12), S("cell", DGR, g=G_BLUE), node="mag")
w.box((0, 0.02, 0.16), (0.08, 0.12, 0.26), S(["panel", "glowline"], BLK, g=G_BLUE))
WEAPONS.append(w)

# 17 Hellfire Incarnate ---------------------------------------------------------------------
w = W("hellfire_incarnate", "Hellfire Incarnate")
w.box((0, 0.03, -0.3), (0.13, 0.14, 0.5), S(["panel", "glowline"], BLK, g=G_RED))
w.box((0, 0.03, -0.72), (0.08, 0.08, 0.34), S(["panel", "glowline"], DGR, g=G_ORANGE))
w.box((0, 0.03, -0.92), (0.1, 0.1, 0.06), S("cell", BLK, g=G_ORANGE))
w.box((0, 0.1, -0.28), (0.05, 0.035, 0.26), S("cell", DRED, g=G_RED))
pistol_grip(w, S("grip", BLK), z=0.0)
w.box((0, -0.09, -0.4), (0.09, 0.09, 0.26), S(["bands", "glowline"], RED, BLK, step=8, bw=2, axis="u", g=G_ORANGE), node="mag")
w.box((0, 0.02, 0.15), (0.08, 0.12, 0.24), S(["panel", "glowline"], BLK, g=G_RED))
WEAPONS.append(w)

# 18 Wraithpiercer ------------------------------------------------------------------------------
w = W("wraithpiercer", "Wraithpiercer")
bow_limbs(w, S(["panel", "glowline"], BLK, g=G_PURPLE), S("cell", DGR, g=G_PURPLE), S("cell", G_PURPLE, g=G_PURPLE),
          kinks=((0.1, -0.2), (0.2, -0.3), (0.26, -0.44), (0.36, -0.5), (0.38, -0.58)), h=0.04)
w.box((0, 0.02, -0.2), (0.055, 0.18, 0.17), S(["grip"], BLK))
for side in (-1, 1):
    w.box((side * 0.2, 0.02, -0.3), (0.03, 0.05, 0.03), S("cell", BLK, g=G_PURPLE))
w.box((0.1, -0.05, -0.04), (0.06, 0.06, 0.22), S(["panel", "glowline"], BLK, g=G_PURPLE))
for x in (0.085, 0.115):
    w.box((x, -0.05, -0.17), (0.012, 0.012, 0.04), S("cell", BLK, g=G_PURPLE))
WEAPONS.append(w)

# 19 Dawn Spear ------------------------------------------------------------------------------------
w = W("dawn_spear", "Dawn Spear")
w.box((0, 0.2, -0.23), (0.04, 1.0, 0.04), S(["white", "bands", "gem"], WHITE, GOLD, step=22, bw=3, axis="v", g=G_BLUE))
w.box((0, 0.72, -0.23), (0.075, 0.08, 0.075), S(["panel", "gem"], GOLD, g=G_BLUE))
w.box((0, 0.9, -0.23), (0.14, 0.26, 0.03), S(["panel", "glowline"], GOLD, g=G_BLUE, vertical=True))
w.box((0, 1.08, -0.23), (0.09, 0.14, 0.03), S("white", WHITE))
w.box((0, 1.19, -0.23), (0.05, 0.1, 0.028), S("white", WHITE))
w.box((0, 1.26, -0.23), (0.022, 0.06, 0.024), S("metal", GOLD))
for side in (-1, 1):
    w.box((side * 0.1, 0.8, -0.23), (0.05, 0.09, 0.03), S("panel", GOLD), rot=(0, 0, side * 32))
w.box((0, -0.32, -0.23), (0.065, 0.065, 0.065), S(["panel", "gem"], GOLD, g=G_BLUE))
WEAPONS.append(w)

# 20 Heavenfall Bazooka ---------------------------------------------------------------------------------
w = W("heavenfall_bazooka", "Heavenfall Bazooka")
w.box((0, 0.05, -0.35), (0.17, 0.17, 1.0), S(["white", "bands"], WHITE, GOLD, step=22, bw=4, axis="u"))
w.box((0, 0.05, -0.87), (0.21, 0.21, 0.07), S(["panel", "gem"], GOLD, g=G_GOLD))
w.box((0, 0.05, 0.17), (0.21, 0.21, 0.07), S("panel", GOLD))
w.box((0, 0.05, -0.91), (0.11, 0.11, 0.02), S("cell", GOLD, g=G_GOLD))
w.box((-0.11, 0.11, -0.35), (0.03, 0.08, 0.1), S("panel", GOLD))
w.box((0.09, 0.05, -0.3), (0.012, 0.04, 0.04), S("cell", BLK, g=G_BLUE))
pistol_grip(w, S("grip", BLK), z=-0.1, y=-0.1)
w.box((0, -0.09, -0.46), (0.045, 0.12, 0.05), S("grip", BLK))
WEAPONS.append(w)

# 21 Absolute Zero -----------------------------------------------------------------------------------------
w = W("absolute_zero", "Absolute Zero")
w.box((0, 0.03, -0.33), (0.13, 0.14, 0.58), S(["panel", "glowline"], BLK, g=G_ICE))
w.box((0, 0.03, -0.75), (0.1, 0.1, 0.3), S("cell", DGR, g=G_BLUE))
w.box((0, 0.03, -0.92), (0.12, 0.12, 0.04), S("panel", DGR))
w.box((0, 0.125, -0.4), (0.06, 0.045, 0.2), S("cell", DGR, g=G_ICE))
pistol_grip(w, S("grip", BLK), z=0.0)
w.box((0, -0.1, -0.26), (0.06, 0.1, 0.12), S("cell", DGR, g=G_BLUE), node="mag")
w.box((0, 0.02, 0.16), (0.08, 0.12, 0.26), S(["panel", "glowline"], BLK, g=G_BLUE))
WEAPONS.append(w)


# ---------------------------------------------------------------- painting
def paint(W_, H_, st, face, rng):
    """Returns (rgb[H,W,3], emit[H,W,3]) with row 0 at the top (v high)."""
    base = np.array(st["c"], dtype=np.float32)
    img = np.tile(base, (H_, W_, 1))
    emit = np.zeros((H_, W_, 3), np.float32)
    pats = st["p"]
    jj, ii = np.mgrid[0:H_, 0:W_]  # row, col
    # per-pixel value noise (keeps the Minecraft-skin look)
    img *= (1 + rng.uniform(-0.07, 0.07, (H_, W_, 1))).astype(np.float32)
    c2 = np.array(st["c2"] if st.get("c2") else base * 0.6, np.float32)
    g = np.array(st["g"], np.float32) if st.get("g") else None
    for p in pats:
        if p == "wood":
            rows = rng.uniform(0.82, 1.1, (H_, 1, 1)).astype(np.float32)
            img *= rows
            streak = rng.random((H_, W_)) < 0.06
            img[streak] *= 0.75
        elif p == "grip":
            img[((ii + jj) % 2 == 0)] *= 0.82
            img[((ii // 2 + jj // 2) % 3 == 0)] *= 1.08
        elif p == "panel":
            if face in ("side", "top", "bottom") and W_ >= 10:
                step = int(st.get("step_panel", 12))
                for x in range(step, W_ - 1, step):
                    img[:, x] *= 0.7
            if W_ >= 8 and H_ >= 6:
                for x, y in ((1, 1), (W_ - 2, 1), (1, H_ - 2), (W_ - 2, H_ - 2)):
                    img[y, x] = np.minimum(img[y, x] * 1.6 + 0.08, 1)
        elif p == "grooves":
            for x in range(2, W_ - 1, 3):
                img[:, x] *= 0.72
        elif p == "vents":
            for y in range(1, H_ - 1, 2):
                img[y, 1:-1] *= 0.55
        elif p == "camo":
            cc = np.array(st.get("cc") or c2, np.float32)
            c3 = np.array(st.get("c3") or (cc * 0.7 + base * 0.3), np.float32)
            n = max(1, int(W_ * H_ * st.get("camo", 0.3) / 10))
            for _ in range(n):
                cx, cy, r = rng.integers(0, W_), rng.integers(0, H_), rng.uniform(1.2, 3.2)
                m = (ii - cx) ** 2 + ((jj - cy) * 1.4) ** 2 < r * r
                img[m] = (cc if rng.random() < 0.55 else c3) * rng.uniform(0.9, 1.1)
        elif p == "blood":
            n = max(1, int(W_ * H_ * st.get("blood", 0.25) / 8))
            for _ in range(n):
                cx, cy, r = rng.integers(0, W_), rng.integers(0, H_), rng.uniform(0.8, 2.6)
                m = (ii - cx) ** 2 + (jj - cy) ** 2 < r * r
                img[m] = np.array((0.55, 0.04, 0.04)) * rng.uniform(0.7, 1.15)
                if face == "side" and rng.random() < 0.5:  # drip down the flat
                    ln = rng.integers(2, 7)
                    img[cy:min(H_, cy + ln), cx] = np.array((0.42, 0.03, 0.03))
        elif p == "bands":
            step, bw = int(st.get("step", 10)), int(st.get("bw", 2))
            axis = st.get("axis", "u")
            coord = ii if axis == "u" else jj
            if face in ("side", "top", "bottom") or axis == "v":
                m = (coord % step) < bw
                img[m] = c2 * (1 + rng.uniform(-0.05, 0.05, (int(m.sum()), 1)))
        elif p == "stripe":
            if face == "side" and H_ >= 5:
                mid = H_ // 2
                img[mid - 1:mid + 1, 1:-1] = c2
        elif p == "dots":
            dc = np.array(st.get("dotc", RED), np.float32)
            if face == "side" and W_ > 8 and H_ > 4:
                for _ in range(max(1, W_ // 14)):
                    x, y = rng.integers(2, W_ - 2), rng.integers(1, H_ - 1)
                    img[y, x] = dc
                    if g is not None:
                        emit[y, x] = g * 0.6
        elif p == "tip":
            tc = np.array(st.get("tipc", BRASS), np.float32)
            if face in ("side", "end"):
                img[-2:, :] = tc  # bottom rows = magazine base
        elif p == "scratch":
            m = rng.random((H_, W_)) < 0.05
            img[m] = np.minimum(img[m] * 1.5 + 0.1, 1)
        elif p == "white":
            if W_ >= 6:
                for x in range(6, W_ - 1, 9):
                    img[:, x] *= 0.8
        elif p == "glowline" and g is not None:
            if face in ("side", "top") and H_ >= 4 and W_ >= 4:
                if st.get("vertical"):
                    x = W_ // 2
                    img[1:-1, x] = g
                    emit[1:-1, x] = g
                else:
                    y = H_ // 2 if face == "side" else H_ // 2
                    seg = rng.integers(3, 7)
                    for x in range(1, W_ - 1):
                        if (x // seg) % 3 != 2:
                            img[y, x] = g
                            emit[y, x] = g
        elif p == "cell" and g is not None:
            img[:] = g * 0.75
            emit[:] = g * 0.8
            if W_ >= 3 and H_ >= 3:
                cx, cy = W_ / 2, H_ / 2
                core = ((ii - cx + 0.5) / max(W_ / 2, 1)) ** 2 + ((jj - cy + 0.5) / max(H_ / 2, 1)) ** 2 < 0.35
                img[core] = np.minimum(g * 1.25 + 0.15, 1)
                emit[core] = np.minimum(g * 1.2, 1)
                frame = (ii == 0) | (jj == 0) | (ii == W_ - 1) | (jj == H_ - 1)
                img[frame] = base * 0.9
                emit[frame] = 0
        elif p == "cell":  # cell without glow = flat plate with frame
            frame = (ii == 0) | (jj == 0) | (ii == W_ - 1) | (jj == H_ - 1)
            img[frame] *= 0.6
        elif p == "gem" and g is not None:
            if W_ >= 3 and H_ >= 3 and face in ("side", "end", "top"):
                y, x = H_ // 2, W_ // 2
                img[y, x] = g
                emit[y, x] = g
                if W_ >= 7:
                    for dx in (-1, 1):
                        img[y, x + dx] = g * 0.7
                        emit[y, x + dx] = g * 0.5
    # bevel: 1px darker outline, lighter top row on the sides (reads as chunky edges)
    if W_ >= 4 and H_ >= 4 and "cell" not in pats:
        img[0, :] = np.minimum(img[0, :] * 1.18 + 0.02, 1)
        img[-1, :] *= 0.72
        img[:, 0] *= 0.82
        img[:, -1] *= 0.82
    edge = st.get("edge")
    if edge is not None and face == "side" and W_ >= 3:
        img[:, -1] = np.array(edge)  # sharpened edge on blades
    return np.clip(img, 0, 1), np.clip(emit, 0, 1)


# ---------------------------------------------------------------- geometry
FACES = [  # normal, u, v, face kind
    ((1, 0, 0), (0, 0, -1), (0, 1, 0), "side"),
    ((-1, 0, 0), (0, 0, 1), (0, 1, 0), "side"),
    ((0, 1, 0), (1, 0, 0), (0, 0, -1), "top"),
    ((0, -1, 0), (-1, 0, 0), (0, 0, -1), "bottom"),
    ((0, 0, 1), (1, 0, 0), (0, 1, 0), "end"),
    ((0, 0, -1), (-1, 0, 0), (0, 1, 0), "end"),
]


def g2b(v):  # game frame -> Blender (z up)
    return Vector((v[0], -v[2], v[1]))


def build_weapon(w):
    rng = np.random.default_rng(zlib.crc32(w.slug.encode()))
    # 1) paint every face
    faces = []
    for pi, part in enumerate(w.parts):
        s = part["s"]
        half = [s[0] / 2, s[1] / 2, s[2] / 2]
        rot = Euler([math.radians(a) for a in part["rot"]], "XYZ").to_matrix()
        for n, u, v, kind in FACES:
            n_, u_, v_ = Vector(n), Vector(u), Vector(v)
            hu = abs(u_.dot(Vector(half)))
            hv = abs(v_.dot(Vector(half)))
            hn = abs(n_.dot(Vector(half)))
            Wp = max(1, int(round(2 * hu * PPM)))
            Hp = max(1, int(round(2 * hv * PPM)))
            rgb, em = paint(Wp, Hp, part["st"], kind, rng)
            c = Vector(part["c"])
            corners = []
            for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                local = n_ * hn + u_ * (su * hu) + v_ * (sv * hv)
                corners.append(c + rot @ local)
            faces.append(dict(node=part["node"], corners=corners, rgb=rgb, em=em, W=Wp, H=Hp))
    # 2) shelf-pack islands (1px padding each side)
    order = sorted(range(len(faces)), key=lambda i: -faces[i]["H"])
    for AW in (128, 256, 512, 1024):
        x = y = rowh = 0
        ok = True
        for i in order:
            f = faces[i]
            w_, h_ = f["W"] + 2, f["H"] + 2
            if x + w_ > AW:
                x, y, rowh = 0, y + rowh, 0
            if w_ > AW or y + h_ > AW:
                ok = False
                break
            f["xy"] = (x + 1, y + 1)
            x += w_
            rowh = max(rowh, h_)
        if ok:
            break
    AH = AW
    atlas = np.zeros((AH, AW, 3), np.float32)
    emit = np.zeros((AH, AW, 3), np.float32)
    for f in faces:
        x0, y0 = f["xy"]
        pad = np.pad(f["rgb"], ((1, 1), (1, 1), (0, 0)), mode="edge")
        pade = np.pad(f["em"], ((1, 1), (1, 1), (0, 0)), mode="edge")
        atlas[y0 - 1:y0 + f["H"] + 1, x0 - 1:x0 + f["W"] + 1] = pad
        emit[y0 - 1:y0 + f["H"] + 1, x0 - 1:x0 + f["W"] + 1] = pade

    def to_image(name, arr):
        img = bpy.data.images.get(name)
        if img:
            bpy.data.images.remove(img)
        img = bpy.data.images.new(name, AW, AH, alpha=False)
        rgba = np.ones((AH, AW, 4), np.float32)
        rgba[..., :3] = arr[::-1]  # Blender rows start at the bottom
        img.pixels.foreach_set(rgba.ravel())
        img.update()
        img.pack()
        return img

    col_img = to_image(f"{w.slug}_albedo", atlas)
    has_emit = emit.max() > 0
    em_img = to_image(f"{w.slug}_emit", emit) if has_emit else None

    # 3) material
    mat = bpy.data.materials.get(f"M_{w.slug}") or bpy.data.materials.new(f"M_{w.slug}")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = col_img
    tex.interpolation = "Closest"
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.62
    bsdf.inputs["Metallic"].default_value = 0.25
    if em_img:
        etex = nt.nodes.new("ShaderNodeTexImage")
        etex.image = em_img
        etex.interpolation = "Closest"
        nt.links.new(etex.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = 2.0

    # 4) meshes per node
    objs = []
    for node in sorted(set(f["node"] for f in faces)):
        name = f"{w.slug}__{node}"
        me = bpy.data.meshes.new(name)
        bm = bmesh.new()
        uvl = bm.loops.layers.uv.new("UVMap")
        for f in faces:
            if f["node"] != node:
                continue
            vs = [bm.verts.new(g2b(c)) for c in f["corners"]]
            bf = bm.faces.new(vs)
            x0, y0 = f["xy"]
            u0, u1 = x0 / AW, (x0 + f["W"]) / AW
            vt, vb = 1 - y0 / AH, 1 - (y0 + f["H"]) / AH
            for loop, uv in zip(bf.loops, ((u0, vb), (u1, vb), (u1, vt), (u0, vt))):
                loop[uvl].uv = uv
        bm.normal_update()
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(node if node != "body" else w.slug, me)
        ob.name = node if node in ("mag", "pump") else w.slug
        ob.data.materials.append(mat)
        ob["dr_weapon"] = w.slug
        bpy.context.scene.collection.objects.link(ob)
        objs.append(ob)
    return objs, AW


def export(w, objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    path = os.path.join(OUT_DIR, f"{w.slug}.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_yup=True,
                              export_apply=True, export_materials="EXPORT", export_image_format="AUTO")
    return path


def setup_render():
    sc = bpy.context.scene
    for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            sc.render.engine = eng
            break
        except Exception:
            pass
    sc.render.resolution_x, sc.render.resolution_y = 960, 540
    sc.render.film_transparent = False
    world = sc.world or bpy.data.worlds.new("W")
    sc.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.05, 0.055, 0.06, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.6
    cam = bpy.data.objects.get("DR_cam")
    if not cam:
        cam = bpy.data.objects.new("DR_cam", bpy.data.cameras.new("DR_cam"))
        sc.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    sc.camera = cam
    for nm, loc, e in (("DR_key", (1.5, 1.5, 2.5), 900), ("DR_fill", (-2, -1, 1), 300)):
        l = bpy.data.objects.get(nm)
        if not l:
            l = bpy.data.objects.new(nm, bpy.data.lights.new(nm, "AREA"))
            sc.collection.objects.link(l)
        l.location = loc
        l.data.energy = e
        l.data.size = 3
        l.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return cam


def render(w, objs, cam):
    others = [o for o in bpy.context.scene.objects if o.type == "MESH" and o not in objs]
    for o in others:
        o.hide_render = True
    mins = Vector((1e9, 1e9, 1e9))
    maxs = -mins
    for o in objs:
        for v in o.data.vertices:
            p = o.matrix_world @ v.co
            mins = Vector(map(min, mins, p))
            maxs = Vector(map(max, maxs, p))
    ctr = (mins + maxs) / 2
    size = max(maxs - mins)
    d = Vector((1.0, -0.85, 0.55)).normalized()
    cam.location = ctr + d * 4
    cam.rotation_euler = (-d).to_track_quat("-Z", "Z").to_euler()
    cam.data.ortho_scale = size * 1.15
    bpy.context.scene.render.filepath = os.path.join(OUT_DIR, f"{w.slug}.png")
    bpy.ops.render.render(write_still=True)
    for o in others:
        o.hide_render = False


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for o in list(bpy.data.objects):
        if "dr_weapon" in o.keys():
            bpy.data.objects.remove(o, do_unlink=True)
    cam = setup_render() if RENDER else None
    report = {}
    for w in WEAPONS:
        if ONLY and w.slug not in ONLY:
            continue
        objs, aw = build_weapon(w)
        path = export(w, objs)
        if RENDER:
            render(w, objs, cam)
        # hide from the viewport after export so the next weapon renders alone
        for o in objs:
            o.hide_render = True
            o.hide_set(True)
        report[w.slug] = dict(name=w.name, atlas=aw, parts=len(w.parts), bytes=os.path.getsize(path))
    return report


result = {"weapons": main()}
