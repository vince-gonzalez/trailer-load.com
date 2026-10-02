# DAY 1 — THE SHOT LIST

Screenshots for `/day1/`, the page a class gets on the first day.

Every trigger below was read out of `lock-in.html`. Where a banner is quoted, that
is the literal string the game prints, so you know you got the right moment.

---

## BEFORE YOU START

**Mode: PRACTICE.** It has the NC tray and the bag tray, and it has **no dispatch
clock and no fail pressure**, so you can set up a shot without the trailer leaving.
The three shots that need the dispatch bar are marked **TRAILER-LOAD**.

**Window:** pick one size and never change it. 1600 x 1000 at 100% zoom is good.
Every strip on the page sits in the same frame, and mismatched crops are the thing
that makes a page look amateur.

**Save to:** `C:\Users\Admin\OneDrive\Desktop\trailer-load\day1\img\`

**Filenames matter.** Use exactly the names below. I am building the page against
them, so a correctly named file drops in and works with no further work.

**Banners auto-dismiss.** Most sit for 1.8 to 3.4 seconds. Have the capture tool
armed before you make the placement.

---

# STRIP 1 — THE BAY

### `01-empty-bay.png`
**What:** the trailer before a single piece is placed.
**How:** start PRACTICE, screenshot immediately.
**Why:** establishes 17 wide, 20 tall, and that row 0 is the ceiling. Every later
shot is read against this one.
**Crop:** the full trailer, nothing else.

### `02-sealed-wall.png`
**What:** a finished wall, floor to ceiling.
**How:** play one out. Any good wall.
**Why:** this is the "what good looks like" image and it belongs near the top.
**Crop:** full trailer.

---

# STRIP 2 — WHERE FREIGHT COMES FROM

### `03-full-hud.png`
**What:** the whole screen with the belt loaded and both trays holding pieces.
**How:** play until you have at least 3 non-conveyables and 2 bags staged.
**Why:** the one orientation image. Belt, NC tray, bag tray, score, pace, all in
one frame.
**Crop:** the entire game viewport.

### `04-belt-closeup.png`
**What:** just the chute with its ten visible pieces.
**Crop:** tight on the belt strip only.

### `05-reach-past.png`
**What:** the cherry-picking warning.
**Trigger:** select a belt piece that is **not** the front one and place it.
**Banner:** `REACHED PAST THE NEXT PIECE — cherry-picking costs efficiency. Take the front when it fits.`
**Note:** fires **once per wall**, on the first time you do it. If you miss it,
restart.

---

# STRIP 3 — SUPPORT, THE ONE RULE

### `06-refused.png`
**What:** an illegal placement being rejected.
**Trigger:** try to place a piece floating with nothing under it.
**Banner:** `✕ NO SUPPORT THERE — every box needs something solid under it.`
**Look for:** red shards burst at the cursor.
**Note:** the banner is rate-limited to once per 2.5 seconds, so pause between
attempts.

### `07-wedged.png`
**What:** a piece legally held with nothing beneath it, braced left and right.
**How:** build two stacks with a gap between them, then drop a piece into the gap
so it keys against both sides.
**Why:** this is the rule nobody discovers alone, and a picture teaches it in a
second.

---

# STRIP 4 — THE SHELF

### `08-locked-flash.png`
**What:** the LOCKED IN flash the instant a full row completes.
**Trigger:** fill all 17 cells of any row.
**Note:** the flash is brief. Arm the capture first.

### `09-locked-row.png`
**What:** the wall a moment later, with the locked row visibly sealed.
**Crop:** full trailer so the locked row reads against the rest.

### `10-bulkhead.png`
**What:** two consecutive locked rows.
**Trigger:** lock a row directly above or below one already locked.

### `11-brick-lock.png`
**What:** the staggered-courses award.
**Trigger:** build with offset seams like bricklaying until 4 or more staggers
register.
**Banner:** `BRICK LOCK! 🏗`
**Once per wall.**

### `12-seam-warning.png`
**What:** the opposite, for contrast.
**Trigger:** stack two pieces so their vertical edges line up in a column.
**Banner:** `⚠ STACKED SEAMS LINE UP — stagger your courses like bricklaying, or it's a weak wall.`
**Once per wall.**

---

# STRIP 5 — FRAGILE

This is the most important strip on the page. Three shots, and they have to be
in this order.

### `13-fragile-tape.png`
**What:** a FRAGILE box sitting in the chute, tape clearly readable.
**Crop:** tight. Close enough to read the tag.

### `14-crunch.png`
**What:** the moment one gets crushed.
**Trigger:** place an **unprotected** fragile with nothing either side of it and
**no locked shelf anywhere below**, then drop a **weight class 5** piece on it.
Class 5 is the big stuff: OVR-LONG, OVR-TALL, OVR-WIDE, PALLET-L, DRUM-XL,
CRATE-L, CRATE-T, BUNDLE, SKID, TIRE-STD.
**Banner:** `💥 CRUNCH!` plus `FRAGILE goes on TOP — safety warning. Lock a shelf to protect it.`
**Do it early in the wall, before you lock anything.** After your first locked
shelf you cannot produce this shot at all.

### `15-fragile-safe.png`
**What:** a fragile boxed in on both sides, surviving a heavy piece on top.
**How:** place a fragile, put a piece flush left of it and flush right of it, then
drop a class 5 piece on it. Nothing happens.
**Why:** this is the payoff image. It proves the real rule.

---

# STRIP 6 — HAZMAT

### `16-hazmat-low.png`
**What:** a hazmat piece correctly seated in the bottom half.
**How:** place any hazmat from the NC tray in rows 10 to 19.

### `17-hazmat-high.png`
**What:** the violation.
**Trigger:** place a hazmat so any part of it is above the waist line, rows 0 to 9.
**Banner:** `☢ HAZMAT TOO HIGH! SCORE HALVED` plus `DANGEROUS GOODS LOAD LOW — BELOW WAIST (49 CFR). MOVE IT DOWN TO RESTORE.`

### `18-segregation.png`
**What:** two hazard classes too close together.
**Trigger:** place two hazmats of **different** classes with fewer than 2 clear
cells between them.
**Banner:** `☢ SEGREGATION BREACH — different hazmat classes need 2 clear cells between them. SCORE HALVED`
**Once per wall.**

### `19-hazmat-shelf.png`
**What:** the big one.
**Trigger:** hazmat loaded low, then complete a full shelf above it.
**Banner:** `☢ HAZMAT SHELF LOCKED` plus `LOADED LOW, CAPPED, SECURED — THE VET MOVE.`

---

# STRIP 7 — THE SIX WAYS IT COMES DOWN

One shot each. Each banner is distinct, which is the point of the strip.

### `20-collapse-tire.png`
**Trigger:** stand a tire on its edge, then place anything one row above it.

### `21-collapse-heavy.png`
**Trigger:** place a class 4 or heavier non-tire piece without something solid
under **every** cell.
**Banner:** `HEAVY FREIGHT, NO FULL BASE — heavy needs something solid under EVERY cell.`

### `22-collapse-column.png`
**Trigger:** build a narrow 2-wide pillar, then put something too tall on top.
**Banner:** starts `COLUMN INTEGRITY —`

### `23-collapse-staircase.png`
**Trigger:** place a piece overhanging its support, then another overhanging that.
**Banner:** `OVERHANG ON AN OVERHANG — that's a staircase, not a wall.`

### `24-collapse-stack.png`
**Trigger:** stack three same-width pieces freestanding, no taper.

### `25-two-high-warning.png`
**What:** the warning that comes **before** the collapse.
**Trigger:** stack exactly two same-width pieces with no support.
**Banner:** `TWO HIGH, SAME WIDTH, NO SUPPORT — that's the limit. Taper it (narrower on top) or lock the shelf before one more.`

---

# STRIP 8 — THE VETERAN MOVES

### `26-tire-flat.png`
**What:** a tire laid flat with its hollow visible.

### `27-nest.png`
**What:** a bag of smalls dropped into a flat tire.
**Trigger:** have a flat tire on the wall and a bag in staging. The hint fires the
first time both are true:
**Banner:** `🛞 VETERAN MOVE — drop a SMALLS BAG onto a flat tire. The smalls NEST in the hollow for bonus cubes.`

### `28-roof-bag.png`
**Trigger:** place a smalls bag with its top edge on row 0, against the ceiling.
**Banner:** `🌟 BAG ON THE ROOF`

### `29-ceiling-course.png`
**What:** five roof bags making a full ceiling course.
**Banner on the fifth:** `ROOF BAG 5/5 — FULL CEILING COURSE!`
**Worth the effort. This is a striking image.**

### `30-cornerstone.png`
**Trigger:** the **first** non-conveyable you place on a fresh wall.
**Banner:** `CORNERSTONE! 🧱`

### `31-corner-lock.png`
**Trigger:** place a non-conveyable touching two edges at once, floor plus a side
wall.
**Banner:** `CORNER LOCK! 🔩`

---

# STRIP 9 — PACE

### `32-pph-hud.png`
**What:** the pace readout mid-wall.
**Crop:** tight on the score and pace area of the HUD.
**Try to catch it above 250**, the hub standard, so the number on the page is a
good one.

### `33-flow-streak.png`
**What:** the flow pip with a streak running.
**Trigger:** several clean placements in a row with no crunch and no collapse.

---

# STRIP 10 — THE RECORD

### `34-write-up.png`
**What:** the SAFETY WRITE-UP clipboard overlay.
**Trigger:** repeat an unmitigated safety offense. The fastest route is tires: stand
one on edge, let the warning land, then stand another on edge.
**Why:** this is the single most important image for an instructor. It is the
artifact that makes the game look like a workplace instead of a toy.

### `35-dispatch.png` — **TRAILER-LOAD**
**What:** the 60 second dispatch bar counting down.
**Trigger:** get a wall to 85% fill or 85% height. Does **not** fire in Practice.
**Banner:** `DISPATCH IN 60s! ⚡`

### `36-post-sort.png`
**What:** the end-of-wall report with the full stat breakdown.
**How:** seal a wall and screenshot the report.

### `37-certificate.png`
**What:** the certificate.
**Conditions, all of them:** 100% wall height, 85% or better pack, 100 integrity,
zero collapses, zero incidents.
**This is the hardest shot on the list.** One wall in 203 has ever earned it. If
you cannot get it, say so and the page runs without it rather than faking one.

### `38-start-menu.png`
**What:** the mode menu, all four pillars.
**How:** screenshot the start screen.
**Note:** hold this one until the clipboard background goes on the start menu,
or it will be the one dated image on the page.

---

## PRIORITY, IF YOU ONLY DO SOME

The page works with these nine and nothing else:

`01` empty bay · `03` full HUD · `06` refused · `08` locked flash ·
`14` crunch · `15` fragile safe · `17` hazmat high · `19` hazmat shelf ·
`34` write-up

The fragile pair, `14` and `15`, carries the whole argument. Get those two even if
you get nothing else.

---

## ONE WARNING ABOUT TIMING

**Any shot showing a score or a point value will go stale when your scoring
rewrite lands.** That is shots `14`, `19`, `28`, `32` and `36`.

Capture the structural ones now. Hold the five with numbers in them until the new
scoring is in, or we reshoot them later.
