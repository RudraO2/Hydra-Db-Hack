import * as Phaser from 'phaser';
import { NPCS } from '@/data/npcs';

// ─── Asset paths (same as OfficeScene — Phaser cache deduplicates) ───────────
const MAP_KEY = 'office-map';
const MAP_JSON_PATH = '/assets/maps/momentum-office.json';
const CHARACTER_ATLAS_PATH = '/assets/sprites/atlas.json';
const TILESET_SOURCES: Record<string, string> = {
  CuteRPG_Field_B: '/assets/tiles/CuteRPG_Field_B.png',
  CuteRPG_Field_C: '/assets/tiles/CuteRPG_Field_C.png',
  CuteRPG_Harbor_C: '/assets/tiles/CuteRPG_Harbor_C.png',
  Room_Builder_32x32: '/assets/tiles/Room_Builder_32x32.png',
  CuteRPG_Village_B: '/assets/tiles/CuteRPG_Village_B.png',
  CuteRPG_Forest_B: '/assets/tiles/CuteRPG_Forest_B.png',
  CuteRPG_Desert_C: '/assets/tiles/CuteRPG_Desert_C.png',
  CuteRPG_Mountains_B: '/assets/tiles/CuteRPG_Mountains_B.png',
  CuteRPG_Desert_B: '/assets/tiles/CuteRPG_Desert_B.png',
  CuteRPG_Forest_C: '/assets/tiles/CuteRPG_Forest_C.png',
  interiors_pt1: '/assets/tiles/interiors_pt1.png',
  interiors_pt2: '/assets/tiles/interiors_pt2.png',
  interiors_pt3: '/assets/tiles/interiors_pt3.png',
  interiors_pt4: '/assets/tiles/interiors_pt4.png',
  interiors_pt5: '/assets/tiles/interiors_pt5.png',
  blocks: '/assets/tiles/blocks_1.png',
  blocks_2: '/assets/tiles/blocks_2.png',
  blocks_3: '/assets/tiles/blocks_3.png',
};

const HIDDEN_LAYERS = [
  'collision', 'interaction', 'arena blocks', 'sector blocks',
  'world blocks', 'spawning blocks', 'special blocks registry',
];

// Room center coordinates (same grid as OfficeScene ROOM_LAYOUT)
const RC: Record<string, { x: number; y: number }> = {
  Entrance:       { x: 450,  y: 290 },
  OpenWorkspace:  { x: 1110, y: 290 },
  ConferenceRoom: { x: 1680, y: 290 },
  CEOOffice:      { x: 450,  y: 670 },
  HROffice:       { x: 1110, y: 670 },
  BreakRoom:      { x: 1680, y: 670 },
  ITCloset:       { x: 450,  y: 1050 },
};

// ─── Types ────────────────────────────────────────────────────────────────────
type Actor = {
  id: string;
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  bubble: Phaser.GameObjects.Text | null;
};

// ─── Scene ────────────────────────────────────────────────────────────────────
export class CutsceneScene extends Phaser.Scene {
  private actors: Actor[] = [];
  private skipped = false;

  constructor() {
    super('CutsceneScene');
  }

  preload() {
    this.load.tilemapTiledJSON(MAP_KEY, MAP_JSON_PATH);
    for (const [name, src] of Object.entries(TILESET_SOURCES)) {
      this.load.image(name, src);
    }
    for (const npc of NPCS) {
      this.load.atlas(npc.id, `/assets/sprites/${npc.id}.png`, CHARACTER_ATLAS_PATH);
    }
  }

  create() {
    // ── Tilemap ──────────────────────────────────────────────────────────────
    const map = this.make.tilemap({ key: MAP_KEY });
    const tilesets = map.tilesets
      .map((ts) => map.addTilesetImage(ts.name, ts.name))
      .filter(Boolean) as Phaser.Tilemaps.Tileset[];

    let depth = 0;
    for (const layerDef of map.layers) {
      const layer = map.createLayer(layerDef.name, tilesets, 0, 0);
      if (!layer) continue;
      layer.setDepth(depth++);
      if (HIDDEN_LAYERS.some((p) => layerDef.name.toLowerCase().includes(p))) {
        layer.setVisible(false);
      }
    }

    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.centerOn(RC.Entrance.x, RC.Entrance.y);

    // ── Animations (global cache — OfficeScene will find them already created) ─
    for (const npc of NPCS) this.makeAnims(npc.id);

    // ── Skip hint ────────────────────────────────────────────────────────────
    const { width, height } = this.cameras.main;
    this.add.text(width - 14, height - 12, '▶ click or any key to skip', {
      fontSize: '11px',
      color: 'rgba(255,255,255,0.38)',
      fontFamily: "'Segoe UI', Tahoma, sans-serif",
    }).setScrollFactor(0).setOrigin(1, 1).setDepth(700);

    // ── Input listeners ──────────────────────────────────────────────────────
    this.input.keyboard?.on('keydown', this.onSkip, this);
    this.input.on('pointerdown', this.onSkip, this);

    // ── Begin ────────────────────────────────────────────────────────────────
    this.cameras.main.fadeIn(700, 0, 0, 0);
    this.runCutscene();
  }

  update() {
    // Keep labels and bubbles glued to sprites (works during tweens too)
    for (const actor of this.actors) {
      actor.label.setPosition(actor.sprite.x, actor.sprite.y - 28);
      if (actor.bubble) {
        actor.bubble.setPosition(actor.sprite.x, actor.sprite.y - 60);
      }
    }
  }

  // ─── Skip / complete ───────────────────────────────────────────────────────
  private onSkip = () => {
    if (this.skipped) return;
    this.skipped = true;
    this.cameras.main.fadeOut(380, 0, 0, 0, (_cam: Phaser.Cameras.Scene2D.Camera, p: number) => {
      if (p === 1) this.scene.start('OfficeScene');
    });
  };

  // ─── Cutscene script ───────────────────────────────────────────────────────
  private runCutscene() {
    let t = 0;

    // ── OPENING TITLE CARD ───────────────────────────────────────────────────
    const c0 = this.card('MOMENTUM CORP', 'Monday · 9:00 AM');
    t += 2600;
    this.at(t, () => this.hideCard(c0));

    // ── BEAT 1: Sanjana at entrance, on a call ───────────────────────────────
    t += 200;
    this.at(t, () => {
      this.cameras.main.pan(RC.Entrance.x, RC.Entrance.y, 600, 'Power2');
    });
    t += 500;
    this.at(t, () => {
      const sanjana = this.spawn('sanjana', 400, 248);
      this.speak(sanjana, '"I\'ll have it by 10am.\nDon\'t worry."', 3000);
    });

    // ── BEAT 2: Pan to CEO office — Kabir at desk with USB ───────────────────
    t += 3300;
    this.at(t, () => {
      this.cameras.main.pan(RC.CEOOffice.x, RC.CEOOffice.y, 1000, 'Power2');
    });
    t += 600;
    this.at(t, () => {
      const kabir = this.spawn('kabir', 352, 622);
      this.speak(kabir, '"Series B financials. All on this drive.\nGuard it with your life."', 3200);
    });

    // ── BEAT 3: Kabir stands, walks out ─────────────────────────────────────
    t += 3600;
    this.at(t, () => {
      const kabir = this.get('kabir');
      if (!kabir) return;
      this.speak(kabir, '"Nature calls. Back in 3."', 1600);
      this.walk(kabir, 500, 490, 2400); // walks out toward corridor
      this.cameras.main.pan(RC.Entrance.x, RC.CEOOffice.y, 2200, 'Power2');
    });

    // ── BEAT 4: Sanjana spots him leaving — moves in ─────────────────────────
    t += 2600;
    this.at(t, () => {
      const sanjana = this.get('sanjana');
      if (!sanjana) return;
      this.speak(sanjana, '"Go time."', 1400);
      // Sanjana walks down from entrance toward CEO office
      this.walk(sanjana, 410, 560, 1800);
      this.cameras.main.pan(RC.CEOOffice.x, RC.CEOOffice.y, 1400, 'Power2');
    });

    // ── BEAT 5: Sanjana inside CEO office, grabs the USB ────────────────────
    t += 2200;
    this.at(t, () => {
      const sanjana = this.get('sanjana');
      if (!sanjana) return;
      this.walk(sanjana, 375, 630, 900);
    });
    t += 1100;
    this.at(t, () => {
      const sanjana = this.get('sanjana');
      if (!sanjana) return;
      this.speak(sanjana, '"Got it. Right on schedule. 💾"', 2600);
    });

    // ── BEAT 6: Rohan wanders by the corridor, notices something ─────────────
    t += 1800;
    this.at(t, () => {
      this.cameras.main.pan(450, 520, 600, 'Power2');
      const rohan = this.spawn('rohan', 560, 500);
      this.walk(rohan, 390, 500, 1100);
      this.time.delayedCall(900, () => {
        if (this.skipped) return;
        const r = this.get('rohan');
        if (r) this.speak(r, '"Wait, was she always carrying\nthat small silver thing? Nah."', 2800);
      });
    });

    // ── BEAT 7: Dev in IT Closet — notices east wing cam offline ─────────────
    t += 3500;
    this.at(t, () => {
      this.cameras.main.pan(RC.ITCloset.x, RC.ITCloset.y, 900, 'Power2');
    });
    t += 500;
    this.at(t, () => {
      const dev = this.spawn('dev', 280, 980);
      this.speak(dev, '"East wing cam just went dark...\nProbably just a glitch."', 2800);
    });

    // ── CLOSING TITLE CARD ───────────────────────────────────────────────────
    t += 3400;
    this.at(t, () => {
      const c1 = this.card('9:10 AM', 'The USB drive is gone.\nYou\'ve been called in to investigate.');
      this.time.delayedCall(3600, () => {
        if (this.skipped) return;
        this.hideCard(c1, () => this.onSkip());
      });
    });
  }

  // ─── Scheduling helper ─────────────────────────────────────────────────────
  private at(ms: number, fn: () => void) {
    this.time.delayedCall(ms, () => {
      if (!this.skipped) fn();
    });
  }

  // ─── Actor helpers ─────────────────────────────────────────────────────────
  private spawn(id: string, x: number, y: number): Actor {
    const npcDef = NPCS.find((n) => n.id === id);

    const sprite = this.add.sprite(x, y, id, 'down').setDepth(100);

    const label = this.add.text(x, y - 28, npcDef?.name.split(' ')[0] ?? id, {
      fontSize: '12px',
      color: '#ffffff',
      stroke: '#10151f',
      strokeThickness: 4,
      fontFamily: "'Segoe UI', Tahoma, sans-serif",
    }).setOrigin(0.5).setDepth(200);

    const actor: Actor = { id, sprite, label, bubble: null };
    this.actors.push(actor);
    return actor;
  }

  private get(id: string): Actor | undefined {
    return this.actors.find((a) => a.id === id);
  }

  private speak(actor: Actor, text: string, duration = 2600) {
    actor.bubble?.destroy();
    actor.bubble = this.add.text(
      actor.sprite.x, actor.sprite.y - 60, text, {
        fontSize: '12px',
        color: '#10151f',
        backgroundColor: '#fffbe6',
        padding: { left: 10, right: 10, top: 7, bottom: 7 },
        wordWrap: { width: 180, useAdvancedWrap: true },
        align: 'center',
        fontFamily: "'Segoe UI', Tahoma, sans-serif",
        lineSpacing: 4,
      }
    ).setOrigin(0.5, 1).setDepth(210);

    this.time.delayedCall(duration, () => {
      actor.bubble?.destroy();
      actor.bubble = null;
    });
  }

  private walk(actor: Actor, x: number, y: number, duration: number) {
    const dx = x - actor.sprite.x;
    const dy = y - actor.sprite.y;

    let anim: string;
    let idleFrame: string;

    if (Math.abs(dx) >= Math.abs(dy)) {
      anim = dx >= 0 ? `${actor.id}-right-walk` : `${actor.id}-left-walk`;
      idleFrame = dx >= 0 ? 'right' : 'left';
    } else {
      anim = dy >= 0 ? `${actor.id}-down-walk` : `${actor.id}-up-walk`;
      idleFrame = dy >= 0 ? 'down' : 'up';
    }

    const id = actor.id;
    actor.sprite.anims.play(anim, true);
    this.tweens.add({
      targets: actor.sprite,
      x,
      y,
      duration,
      ease: 'Linear',
      onComplete: () => {
        actor.sprite.anims.stop();
        actor.sprite.setTexture(id, idleFrame);
      },
    });
  }

  // ─── Animation creation (global cache) ────────────────────────────────────
  private makeAnims(id: string) {
    for (const dir of ['left', 'right', 'down', 'up'] as const) {
      const key = `${id}-${dir}-walk`;
      if (this.anims.exists(key)) continue;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNames(id, {
          prefix: `${dir}-walk.`,
          start: 0,
          end: 3,
          zeroPad: 3,
        }),
        frameRate: 4,
        repeat: -1,
      });
    }
  }

  // ─── Title card helpers ────────────────────────────────────────────────────
  private card(title: string, subtitle: string): Phaser.GameObjects.GameObject[] {
    const { width, height } = this.cameras.main;
    const cx = width / 2;
    const cy = height / 2;

    const overlay = this.add
      .rectangle(cx, cy, width, height, 0x07090e, 0.92)
      .setScrollFactor(0)
      .setDepth(500);

    // Amber top accent line
    const accent = this.add
      .rectangle(cx, cy - 54, 80, 2, 0xf3b640)
      .setScrollFactor(0)
      .setDepth(501);

    const t1 = this.add
      .text(cx, cy - 22, title, {
        fontSize: '28px',
        fontStyle: 'bold',
        color: '#f3b640',
        fontFamily: "'Segoe UI', Tahoma, sans-serif",
        stroke: '#07090e',
        strokeThickness: 3,
      })
      .setScrollFactor(0)
      .setOrigin(0.5)
      .setDepth(501);

    const t2 = this.add
      .text(cx, cy + 24, subtitle, {
        fontSize: '14px',
        color: '#9cb0d4',
        fontFamily: "'Segoe UI', Tahoma, sans-serif",
        align: 'center',
        lineSpacing: 7,
      })
      .setScrollFactor(0)
      .setOrigin(0.5)
      .setDepth(501);

    return [overlay, accent, t1, t2];
  }

  private hideCard(objects: Phaser.GameObjects.GameObject[], onDone?: () => void) {
    this.tweens.add({
      targets: objects,
      alpha: 0,
      duration: 380,
      onComplete: () => {
        objects.forEach((o) => o.destroy());
        onDone?.();
      },
    });
  }
}
