// Shared bits for layered characters (player + zombies): all parts live on
// one 32x32 canvas with the feet at (16, 32), and are animated by moving
// whole parts a pixel or two (no stretching).

export const ORIGIN_X = 16, ORIGIN_Y = 32;

// Walk: 8 frames, two steps. The body (and head with it) rises a pixel while
// the feet pass each other and drops back when a foot lands. Each foot is
// planted for half the cycle sliding backward, then swings forward through
// the air: [dx, lift] per frame.
export const WALK_BODY = [0, -1, -1, 0, 0, -1, -1, 0];
// The head rides a pixel higher than the body at the top of each step.
export const WALK_HEAD = [0, -1, -2, -1, 0, -1, -2, -1];
export const FOOT_CYCLE = [[2, 0], [1, 0], [-1, 0], [-2, 0], [-1, 1], [0, 2], [1, 2], [1, 1]];
export const STEP_FRAMES = { 0: 'R', 4: 'L' };   // frames where a foot lands

// Leg pose for walk frame f: [[dxL, liftL], [dxR, liftR]]; `side` (0..1) is
// how sideways the movement is - walking up/down the screen shortens the stride.
export function walkLegs(f, side) {
  const stride = (dx) => Math.sign(dx) * Math.round(Math.abs(dx) * (0.5 + 0.5 * side));
  const [rx, rl] = FOOT_CYCLE[f], [lx, ll] = FOOT_CYCLE[(f + 4) % 8];
  return [[stride(lx), ll], [stride(rx), rl]];
}

// Translate + mirror so local coords have the feet at (0, 0), facing +x.
export function enterFacing(ctx, x, y, facing) {
  ctx.save();
  // +1 when mirrored keeps the body's centre column in place
  ctx.translate(facing < 0 ? x + 1 : x, y);
  if (facing < 0) ctx.scale(-1, 1);
}
