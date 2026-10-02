// Prove the certificate bar accepts what it should and REFUSES every way a wall can fall short.
// Pulls liCertGrade straight out of the shipped file - no reimplementation.
//
// v3.5.190: this gate used to hardcode `var CERT_MIN_PACK=85;` in BOTH its source lookup and its
// test boundaries, so raising the bar broke the gate instead of testing it. It now reads the bar
// out of the file and DERIVES the boundary cases from it. Change the constant in lock-in.html and
// this gate re-aims itself; it can no longer drift from what ships.
var fs = require('fs');
var src = fs.readFileSync('C:/Users/Admin/OneDrive/Desktop/trailer-load/lock-in.html', 'utf8');

var m = /var CERT_MIN_PACK=(\d+);/.exec(src);
if (!m) { console.log('FAIL: could not find CERT_MIN_PACK'); process.exit(1); }
var BAR = parseInt(m[1], 10);

var a = m.index;
var END = 'function liCertEarned(){return !!liCertGrade();}';
var b = src.indexOf(END);
if (b < 0) { console.log('FAIL: could not locate the block'); process.exit(1); }
var block = src.slice(a, b + END.length);

var GW = 17, GH = 20, TOTAL = GW * GH;
var G = null, S = null;
function packPct(){ return Math.round(countFilled() / TOTAL * 100); }
function wallH(){ for (var y = 0; y < GH; y++) for (var x = 0; x < GW; x++) if (G.grid[y][x]) return GH - y; return 0; }
function countFilled(){ var n = 0; for (var y = 0; y < GH; y++) for (var x = 0; x < GW; x++) if (G.grid[y][x]) n++; return n; }
function gridPieceCount(){ return 42; }

eval(block);

// The gate reads packPct(), the SAME rounded number the seal banner and the scoreboard show the
// player. So the real floor is the smallest cell count that DISPLAYS as the bar: refusing a wall
// the game itself calls 95% would be the inconsistency, not the accept.
var FLOOR = null, i;
for (i = 0; i <= TOTAL; i++) { if (Math.round(i / TOTAL * 100) >= BAR) { FLOOR = i; break; } }
var UNDER = FLOOR - 1;
var EXACT = Math.ceil(TOTAL * BAR / 100);   // the mathematically-exact bar, at or above FLOOR

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

var BASE = { cells: FLOOR, ceiling: true, sealed: true, integ: 100, col: 0, inc: 0 };
function T(name, over, want){
  var o = {}, k, k2; for (k in BASE) o[k] = BASE[k];
  for (k2 in over) o[k2] = over[k2];
  setup(o);
  var g = liCertGrade();
  var got = !!g;
  var ok = (got === want);
  console.log((ok ? '  ok   ' : '  FAIL ') + name + '  -> ' + (got ? ('EARNED pack=' + g.pack + '% perfect=' + g.perfect) : 'refused'));
  return ok;
}

var all = true;
console.log('BAR READ FROM lock-in.html: ' + BAR + '%  (floor = ' + FLOOR + ' cells of ' + TOTAL +
            ', which displays as ' + Math.round(FLOOR / TOTAL * 100) + '%)');
console.log('');
console.log('ACCEPT');
all &= T('exactly at the floor (' + FLOOR + ' cells)',                 {}, true);
all &= T('the exact arithmetic bar (' + EXACT + ' cells)',             { cells: EXACT }, true);
all &= T('a genuinely perfect ' + TOTAL + '/' + TOTAL + ' wall',       { cells: TOTAL }, true);
console.log('REFUSE');
all &= T('one cell under the floor (' + UNDER + ' cells)',             { cells: UNDER }, false);
all &= T("Vince's 88% daily - earned under the old 85 bar",            { cells: 300 }, false);
all &= T("Vince's 84% shift wall",                                     { cells: 286 }, false);
all &= T('stopped short - wall never reached the ceiling',             { ceiling: false }, false);
all &= T('not sealed yet',                                             { sealed: false }, false);
all &= T('integrity 99 - something shifted',                           { integ: 99 }, false);
all &= T('one collapse on this wall',                                  { col: 1 }, false);
all &= T('one incident on this wall',                                  { inc: 1 }, false);
all &= T('full pack but a collapse - quality still gates it',          { cells: TOTAL, col: 1 }, false);

// the perfect flag must fire ONLY at every cell filled
setup(BASE); var gFloor = liCertGrade();
if (gFloor && gFloor.perfect) { console.log('  FAIL floor wall claimed PERFECT'); all = false; }
else console.log('  ok   a floor wall is NOT labelled perfect');
setup({ cells: TOTAL, ceiling: true, sealed: true, integ: 100, col: 0, inc: 0 });
var gFull = liCertGrade();
if (!gFull || !gFull.perfect) { console.log('  FAIL a full ' + TOTAL + '-cell wall is not labelled perfect'); all = false; }
else console.log('  ok   a full ' + TOTAL + '-cell wall IS labelled perfect');

// The bar must stay high enough that the certificate photo reads as a full wall.
// 51 empty cells (the old 85) printed a picture with visible holes in it.
var emptyAtFloor = TOTAL - FLOOR;
if (emptyAtFloor > 20) {
  console.log('  FAIL the bar leaves ' + emptyAtFloor + ' cells empty - the certificate picture will show holes');
  all = false;
} else {
  console.log('  ok   the bar leaves only ' + emptyAtFloor + ' cells empty - reads as a full wall');
}

console.log(all ? '\nALL PASS' : '\nFAILURES ABOVE');
process.exit(all ? 0 : 1);
