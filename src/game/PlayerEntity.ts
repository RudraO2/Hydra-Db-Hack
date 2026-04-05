type CursorKeys = {
  left: { isDown: boolean };
  right: { isDown: boolean };
  up: { isDown: boolean };
  down: { isDown: boolean };
};

export function applyPlayerMovement(params: {
  sprite: any;
  cursors: CursorKeys;
  speed: number;
}) {
  const { sprite, cursors, speed } = params;
  let vx = 0;
  let vy = 0;

  if (cursors.left.isDown) vx -= speed;
  if (cursors.right.isDown) vx += speed;
  if (cursors.up.isDown) vy -= speed;
  if (cursors.down.isDown) vy += speed;

  sprite.setVelocity(vx, vy);
}
