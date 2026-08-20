// Prove the new bar accepts what it should and REFUSES every way a wall can fall short.
// Pulls liCertGrade straight out of the shipped file - no reimplementation.
var fs = require('fs');
var src = fs.readFileSync('C:/Users/Admin/OneDrive/Desktop/trailer-load/lock-in.html', 'utf8');

var a = src.indexOf('var CERT_MIN_PACK=85;');
var b = src.indexOf('function liCertEarned(){return !!liCertGrade();}');
if (a < 0 || b < 0) { console.log('FAIL: could not locate the block'); process.exit(1); }
var block = src.slice(a, b + 48);

var GW = 17, GH = 20;
var G = null, S = null;
function packPct(){ return Math.round(countFilled() / (GW * GH) * 100); }
function wallH(){ for (var y = 0; y < GH; y++) for (var x = 0; x < GW; x++) if (G.grid[y][x]) return GH - y; return 0; }
function countFilled(){ var n = 0; for (var y = 0; y < GH; y++) for (var x = 0; x < GW; x++) if (G.grid[y][x]) n++; return n; }
function gridPieceCount(){ return 42; }

eval(block);

// build a grid holding exactly `cells` filled, packed from the bottom up,
// and (when tall) with the top row touched so wallH() reports the ceiling.
function grid(cells, toCeiling){
  var g = [], y, x;
  for (y = 0; y < GH; y++) { g[y] = []; for (x = 0; x < GW; x++) g[y][x] = 0; }
  var left = cells;
  for (y = GH - 1; y >= 0 && left > 0; y--) for (x = 0; x < GW && left > 0; x++) { g[y][x] = 1; left--; }
  if (toCeiling) { if (!g[0][0]) { // move one cell up to the ceiling
      outer: for (y = 0; y < GH; y++) for (x = 0; x < GW; x++) if (g[y][x]) { g[y][x] = 0; g[0][0] = 1; break outer; } } }
  else { for (x = 0; x < GW; x++) g[0][x] = 0; }
  return g;
}
function setup(o){
  G = { grid: grid(o.cells, o.ceiling), sealed: o.sealed, integrity: o.integ };
  S = { wallLog: [{ collapses: o.col, incidentsWall: o.inc }], collapses: o.col, incidents: [] };
}

var BASE = { cells: 300, ceiling: true, sealed: true, integ: 100, col: 0, inc: 0 }; // 300/340 = 88%
function T(name, over, want){
  var o = {}; for (var k in BASE) o[k] = BASE[k];
  for (var k2 in over) o[k2] = over[k2];
  setup(o);
  var g = liCertGrade();
  var got = !!g;
  var ok = (got === want);
  console.log((ok ? '  ok   ' : '  FAIL ') + name + '  -> ' + (got ? ('EARNED pack=' + g.pack + '% perfect=' + g.perfect) : 'refused'));
  return ok;
}

var all = true;
console.log('ACCEPT');
all &= T("Vince's 88% daily: ceiling, integ 100, 0 col, 0 inc", {}, true);
all &= T('a genuinely perfect 340/340 wall',                    { cells: 340 }, true);
all &= T('exactly at the 85% floor (289 cells)',                { cells: 289 }, true);
// the gate reads packPct(), the SAME rounded number the seal banner and the
// scoreboard show the player. 288/340 = 84.7% displays as 85%, so it must earn --
// refusing a wall the game itself calls 85% is the inconsistency, not the accept.
all &= T('288 cells - displays as 85%, so it earns',            { cells: 288 }, true);
console.log('REFUSE');
all &= T('287 cells - displays as 84%, one under the floor',    { cells: 287 }, false);
all &= T("Vince's 84% shift wall",                              { cells: 286 }, false);
all &= T('stopped short - wall never reached the ceiling',      { ceiling: false }, false);
all &= T('not sealed yet',                                      { sealed: false }, false);
all &= T('integrity 99 - something shifted',                    { integ: 99 }, false);
all &= T('one collapse on this wall',                           { col: 1 }, false);
all &= T('one incident on this wall',                           { inc: 1 }, false);
all &= T('full pack but a collapse - quality still gates it',   { cells: 340, col: 1 }, false);

// the perfect flag must not fire below 340
setup(BASE); var g88 = liCertGrade();
if (g88.perfect) { console.log('  FAIL 88% wall claimed PERFECT'); all = false; }
else console.log('  ok   88% wall is NOT labelled perfect');

console.log(all ? '\nALL PASS' : '\nFAILURES ABOVE');
process.exit(all ? 0 : 1);
