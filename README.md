```
╔════════════════════════════════════════════════════════════════════════════════════════════╗
║                                                                                            ║
║                     ██╗      ██████╗  ██████╗██╗  ██╗    ██╗███╗   ██╗                     ║
║                     ██║     ██╔═══██╗██╔════╝██║ ██╔╝    ██║████╗  ██║                     ║
║                     ██║     ██║   ██║██║     █████╔╝     ██║██╔██╗ ██║                     ║
║                     ██║     ██║   ██║██║     ██╔═██╗     ██║██║╚██╗██║                     ║
║                     ███████╗╚██████╔╝╚██████╗██║  ██╗    ██║██║ ╚████║                     ║
║                     ╚══════╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝    ╚═╝╚═╝  ╚═══╝                     ║
║                                                                                            ║
║                    a freight-loading simulator that plays like the job                     ║
║                                                                                            ║
╚════════════════════════════════════════════════════════════════════════════════════════════╝
```

[trailer-load.com](https://trailer-load.com) · load the trailer, brace the
load, and find out at the wall whether it holds. Free, in the browser, with a
daily challenge that is the same trailer for everyone.

## What it is

Every piece carries a weight class and a footprint. Only the heaviest freight
(weight class 5) crushes: set directly on an exposed fragile, small package, bag
or hazmat, it breaks it, unless that piece has a box on each side or sits on or
above a locked shelf. Playing well
means the things a loader actually thinks about: heavy low, nothing spanning a
gap it cannot bridge, fragile off the floor and out from under the weight, and
the load braced before the doors close.

`lock-in.html` is the simulator. `dashboard/` is the operator view. `for-districts/`
is the schools page.

## Assets

The tapes, tires and cards at the repository root are the simulator's art, loaded
directly rather than bundled, so a new hazard tape is a PNG and a line of
config rather than a build step.

---

```
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║      ███████╗      ██╗  ██╗███████╗██╗   ██╗███████╗       ║
║      ██╔════╝      ██║ ██╔╝██╔════╝╚██╗ ██╔╝██╔════╝       ║
║      █████╗  █████╗█████╔╝ █████╗   ╚████╔╝ ███████╗       ║
║      ██╔══╝  ╚════╝██╔═██╗ ██╔══╝    ╚██╔╝  ╚════██║       ║
║      ██║           ██║  ██╗███████╗   ██║   ███████║       ║
║      ╚═╝           ╚═╝  ╚═╝╚══════╝   ╚═╝   ╚══════╝       ║
║                                                            ║
║               ·   C  R  E  A  T  I  V  E   ·               ║
║                                                            ║
║          ────────────────────────────────────────          ║
║                                                            ║
║                      Vincent Gonzalez                      ║
║                         f-keys.com                         ║
║                 ORCID 0009-0005-3640-014X                  ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
```

Part of [F-Keys](https://f-keys.com) · independent hardware, software
and internet products. See the [working log](https://f-keys.com/log/)
and [live status](https://f-keys.com/status/).
