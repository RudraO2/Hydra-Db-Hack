import * as Phaser from 'phaser';
import { NPCS } from '@/data/npcs';
import { OPENING_LINES, type CutsceneLine, type Speaker } from '@/data/cutscene';
import { CutsceneVoice, loadCutsceneManifest } from '@/lib/cutsceneAudio';

/**
 * The opening cold open.
 *
 * Every beat is anchored to a real voice line: the scene asks the audio layer
 * how long the clip actually is and holds the shot for exactly that long, so
 * the camera, the subtitle and the performance never drift apart. If audio is
 * unavailable the same beats play on estimated reading time instead.
 */

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
  blocks_3: '/assets/tiles/blocks_3.png'
};

const HIDDEN_LAYERS = [
  'collision', 'interaction', 'arena blocks', 'sector blocks',
  'world blocks', 'spawning blocks', 'special blocks registry'
];

const ROOM_CENTER: Record<string, { x: number; y: number }> = {
  Entrance: { x: 450, y: 290 },
  OpenWorkspace: { x: 1110, y: 290 },
  ConferenceRoom: { x: 1680, y: 290 },
  CEOOffice: { x: 450, y: 670 },
  HROffice: { x: 1110, y: 670 },
  BreakRoom: { x: 1680, y: 670 },
  ITCloset: { x: 450, y: 1050 },
  AccountsDesk: { x: 1110, y: 1050 }
};

const SPEAKER_COLOR: Record<Speaker, string> = {
  narrator: '#e8edf8',
  kabir: '#f2a65a',
  priya: '#f07178',
  dev: '#5ea1ff',
  meera: '#c1a6ff',
  sanjana: '#7ed6a7',
  rohan: '#ffd166'
};

const SPEAKER_NAME: Record<Speaker, string> = {
  narrator: '',
  kabir: 'Kabir Malhotra',
  priya: 'Priya Sharma',
  dev: 'Dev Malhotra',
  meera: 'Meera Joshi',
  sanjana: 'Sanjana Kapoor',
  rohan: 'Rohan Mehta'
};

type Actor = {
  id: string;
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
};

type Beat = {
  line?: CutsceneLine;
  /** Runs when the beat starts - camera moves, spawns, walks. */
  enter?: () => void;
  /** Extra hold after the voice line finishes, in ms. */
  tail?: number;
  /** Used when there is no audio for this line. */
  fallbackMs?: number;
};

const LINE_BY_ID = Object.fromEntries(OPENING_LINES.map((line) => [line.id, line])) as Record<string, CutsceneLine>;

export class CutsceneScene extends Phaser.Scene {
  private actors: Actor[] = [];
  private finished = false;
  private voice = new CutsceneVoice();
  private audioReady = false;

  // Cinematic furniture
  private barTop!: Phaser.GameObjects.Rectangle;
  private barBottom!: Phaser.GameObjects.Rectangle;
  private vignette!: Phaser.GameObjects.Graphics;
  private subtitle!: Phaser.GameObjects.Text;
  private speakerTag!: Phaser.GameObjects.Text;
  private clockText!: Phaser.GameObjects.Text;
  private skipHint!: Phaser.GameObjects.Text;
  private captionBg!: Phaser.GameObjects.Rectangle;

  private beats: Beat[] = [];
  private beatIndex = 0;
  private beatTimer?: Phaser.Time.TimerEvent;
  private typeTimer?: Phaser.Time.TimerEvent;

  constructor() {
    super('CutsceneScene');
  }

  preload() {
    this.load.tilemapTiledJSON(MAP_KEY, MAP_JSON_PATH);
    for (const [name, src] of Object.entries(TILESET_SOURCES)) this.load.image(name, src);
    for (const npc of NPCS) this.load.atlas(npc.id, `/assets/sprites/${npc.id}.png`, CHARACTER_ATLAS_PATH);
  }

  create() {
    this.buildWorld();
    this.buildCinematicOverlay();
    this.buildBeats();

    this.input.keyboard?.on('keydown', this.onSkipKey, this);
    this.input.on('pointerdown', this.onPointerDown, this);

    this.cameras.main.fadeIn(900, 0, 0, 0);

    // Decode the voice track before the first beat so line one is not silent.
    void this.prepareAudio().finally(() => this.runBeat(0));
  }

  update() {
    for (const actor of this.actors) {
      actor.label.setPosition(actor.sprite.x, actor.sprite.y - 30);
    }
  }

  // ─── World ─────────────────────────────────────────────────────────────────

  private buildWorld() {
    const map = this.make.tilemap({ key: MAP_KEY });
    const tilesets = map.tilesets
      .map((set) => map.addTilesetImage(set.name, set.name))
      .filter(Boolean) as Phaser.Tilemaps.Tileset[];

    // Skip the invisible bookkeeping layers entirely rather than building and
    // hiding them - each one is 14,000 tiles that would never render.
    let depth = 0;
    for (const layerDef of map.layers) {
      const name = layerDef.name.toLowerCase();
      if (HIDDEN_LAYERS.some((pattern) => name.includes(pattern))) continue;
      const layer = map.createLayer(layerDef.name, tilesets, 0, 0);
      if (!layer) continue;
      layer.setDepth(depth++);
    }

    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.centerOn(ROOM_CENTER.Entrance.x, ROOM_CENTER.Entrance.y);
    // A tighter lens on the cold open; the office scene plays at 1:1.
    this.cameras.main.setZoom(1.35);

    for (const npc of NPCS) this.makeAnims(npc.id);
  }

  private buildCinematicOverlay() {
    const { width, height } = this.scale;
    const barHeight = Math.round(height * 0.11);

    this.barTop = this.add
      .rectangle(width / 2, -barHeight / 2, width, barHeight, 0x05070c)
      .setScrollFactor(0)
      .setDepth(600);
    this.barBottom = this.add
      .rectangle(width / 2, height + barHeight / 2, width, barHeight, 0x05070c)
      .setScrollFactor(0)
      .setDepth(600);

    // Letterbox slides in - the shot "becomes" cinematic rather than starting there.
    this.tweens.add({ targets: this.barTop, y: barHeight / 2, duration: 900, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: this.barBottom, y: height - barHeight / 2, duration: 900, ease: 'Cubic.easeOut' });

    this.vignette = this.add.graphics().setScrollFactor(0).setDepth(590);
    this.drawVignette(width, height);

    this.captionBg = this.add
      .rectangle(width / 2, height - barHeight - 52, Math.min(width * 0.78, 900), 92, 0x05070c, 0.72)
      .setScrollFactor(0)
      .setDepth(610)
      .setAlpha(0);

    this.speakerTag = this.add
      .text(width / 2, height - barHeight - 88, '', {
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#f3b640',
        fontFamily: "'Segoe UI', Tahoma, sans-serif"
      })
      .setScrollFactor(0)
      .setOrigin(0.5)
      .setDepth(612)
      .setAlpha(0);

    this.subtitle = this.add
      .text(width / 2, height - barHeight - 52, '', {
        fontSize: '17px',
        color: '#eef2fb',
        align: 'center',
        wordWrap: { width: Math.min(width * 0.72, 840), useAdvancedWrap: true },
        fontFamily: "'Segoe UI', Tahoma, sans-serif",
        lineSpacing: 7,
        shadow: { offsetX: 0, offsetY: 2, color: '#000000', blur: 8, fill: true }
      })
      .setScrollFactor(0)
      .setOrigin(0.5)
      .setDepth(612);

    this.clockText = this.add
      .text(28, barHeight + 22, '', {
        fontSize: '13px',
        color: '#f3b640',
        fontFamily: 'monospace',
        fontStyle: 'bold'
      })
      .setScrollFactor(0)
      .setDepth(612)
      .setAlpha(0);

    this.skipHint = this.add
      .text(width - 22, height - 18, 'SPACE  skip  ·  M  mute', {
        fontSize: '11px',
        color: '#7d8aa4',
        fontFamily: "'Segoe UI', Tahoma, sans-serif"
      })
      .setScrollFactor(0)
      .setOrigin(1, 1)
      .setDepth(620);

    this.scale.on(Phaser.Scale.Events.RESIZE, this.layoutOverlay, this);
  }

  private drawVignette(width: number, height: number) {
    this.vignette.clear();
    // Cheap layered vignette - a few translucent rings read as a soft falloff
    // without the cost of a real radial-gradient texture.
    const steps = 7;
    for (let i = 0; i < steps; i += 1) {
      const inset = (i / steps) * Math.min(width, height) * 0.34;
      this.vignette.lineStyle(Math.min(width, height) * 0.06, 0x03060c, 0.07);
      this.vignette.strokeRect(-inset, -inset, width + inset * 2, height + inset * 2);
    }
  }

  private layoutOverlay = () => {
    const { width, height } = this.scale;
    const barHeight = Math.round(height * 0.11);

    this.barTop.setPosition(width / 2, barHeight / 2).setSize(width, barHeight);
    this.barBottom.setPosition(width / 2, height - barHeight / 2).setSize(width, barHeight);
    this.captionBg.setPosition(width / 2, height - barHeight - 52).setSize(Math.min(width * 0.78, 900), 92);
    this.subtitle.setPosition(width / 2, height - barHeight - 52);
    this.subtitle.setWordWrapWidth(Math.min(width * 0.72, 840));
    this.speakerTag.setPosition(width / 2, height - barHeight - 88);
    this.clockText.setPosition(28, barHeight + 22);
    this.skipHint.setPosition(width - 22, height - 18);
    this.drawVignette(width, height);
  };

  // ─── Audio ─────────────────────────────────────────────────────────────────

  private async prepareAudio() {
    try {
      const manifest = await loadCutsceneManifest();
      await this.voice.preload(manifest, OPENING_LINES.map((line) => line.id));
      await this.voice.unlock();
      this.audioReady = true;
    } catch {
      this.audioReady = false;
    }
  }

  // ─── Beats ─────────────────────────────────────────────────────────────────

  private buildBeats() {
    const camera = this.cameras.main;
    const panTo = (room: keyof typeof ROOM_CENTER, duration = 1100) => {
      const target = ROOM_CENTER[room];
      camera.pan(target.x, target.y, duration, 'Sine.easeInOut');
    };

    this.beats = [
      // 1. Establishing narration over a slow drift across the office.
      {
        line: LINE_BY_ID.open_01_narrator,
        enter: () => {
          this.showClock('8:50 AM');
          camera.pan(ROOM_CENTER.OpenWorkspace.x, ROOM_CENTER.OpenWorkspace.y, 9000, 'Sine.easeInOut');
          this.zoomTo(1.2, 9000);
        },
        tail: 350
      },

      // 2. Sanjana at the entrance, on a call she does not want overheard.
      {
        line: LINE_BY_ID.open_02_sanjana,
        enter: () => {
          this.showClock('8:50 AM');
          panTo('Entrance', 900);
          this.zoomTo(1.6, 1400);
          const sanjana = this.spawn('sanjana', 400, 250, 'down');
          this.pulse(sanjana);
        },
        tail: 400
      },

      // 3. Kabir, holding the thing everyone will spend the day looking for.
      {
        line: LINE_BY_ID.open_03_kabir,
        enter: () => {
          this.showClock('9:00 AM');
          panTo('CEOOffice', 1200);
          this.zoomTo(1.5, 1400);
          const kabir = this.spawn('kabir', 352, 622, 'down');
          this.pulse(kabir);
          this.glint(392, 624);
        },
        tail: 350
      },

      // 4. He leaves. Three minutes.
      {
        line: LINE_BY_ID.open_04_kabir,
        enter: () => {
          this.showClock('9:05 AM');
          const kabir = this.actor('kabir');
          if (kabir) this.walk(kabir, 520, 500, 2200);
          camera.pan(470, 540, 2200, 'Sine.easeInOut');
        },
        tail: 500
      },

      // 5. Sanjana moves the moment the corridor is clear.
      {
        line: LINE_BY_ID.open_05_sanjana,
        enter: () => {
          this.showClock('9:06 AM');
          const sanjana = this.actor('sanjana');
          if (sanjana) this.walk(sanjana, 415, 555, 1900);
          camera.pan(430, 470, 1500, 'Sine.easeInOut');
          this.zoomTo(1.45, 1500);
        },
        tail: 900
      },

      // 6. The theft itself, in one quiet close-up.
      {
        line: LINE_BY_ID.open_06_sanjana,
        enter: () => {
          this.showClock('9:07 AM');
          const sanjana = this.actor('sanjana');
          if (sanjana) this.walk(sanjana, 378, 628, 1000);
          camera.pan(ROOM_CENTER.CEOOffice.x - 40, ROOM_CENTER.CEOOffice.y, 1200, 'Sine.easeInOut');
          this.zoomTo(1.95, 1600);
          this.time.delayedCall(1100, () => {
            if (this.finished) return;
            this.glint(392, 624, 0xfff0b8);
            this.cameras.main.flash(240, 255, 236, 190, false);
          });
        },
        tail: 600
      },

      // 7. Rohan sees it and files it under none of my business.
      {
        line: LINE_BY_ID.open_07_rohan,
        enter: () => {
          this.showClock('9:07 AM');
          camera.pan(470, 520, 800, 'Sine.easeInOut');
          this.zoomTo(1.55, 1000);
          const rohan = this.spawn('rohan', 585, 500, 'left');
          this.walk(rohan, 445, 500, 1500);
        },
        tail: 400
      },

      // 8. Dev blinds the east wing without knowing what he covered.
      {
        line: LINE_BY_ID.open_08_dev,
        enter: () => {
          this.showClock('9:08 AM');
          panTo('ITCloset', 1200);
          this.zoomTo(1.6, 1400);
          const dev = this.spawn('dev', 300, 1000, 'down');
          this.pulse(dev);
          this.time.delayedCall(900, () => {
            if (!this.finished) this.cameras.main.flash(500, 40, 12, 18, false);
          });
        },
        tail: 400
      },

      // 9. Meera, who heard the one thing that matters.
      {
        line: LINE_BY_ID.open_09_meera,
        enter: () => {
          this.showClock('9:09 AM');
          panTo('AccountsDesk', 1300);
          this.zoomTo(1.5, 1400);
          const meera = this.spawn('meera', 1050, 1010, 'down');
          this.pulse(meera);
        },
        tail: 400
      },

      // 10. Pull back out for the closing narration.
      {
        line: LINE_BY_ID.open_10_narrator,
        enter: () => {
          this.showClock('9:10 AM');
          this.hideClockSoon();
          camera.pan(ROOM_CENTER.HROffice.x, ROOM_CENTER.HROffice.y, 8000, 'Sine.easeInOut');
          this.zoomTo(1.05, 8000);
        },
        tail: 700
      }
    ];
  }

  private runBeat(index: number) {
    if (this.finished) return;

    if (index >= this.beats.length) {
      this.finish();
      return;
    }

    this.beatIndex = index;
    const beat = this.beats[index];
    beat.enter?.();

    let holdMs = beat.fallbackMs ?? 2600;

    if (beat.line) {
      const played = this.audioReady ? this.voice.play(beat.line.id) : 0;
      // With audio, the shot lasts exactly as long as the performance. Without
      // it, fall back to a readable-at-a-glance estimate.
      holdMs = played > 0 ? played : Math.max(2200, beat.line.text.length * 52);
      this.showSubtitle(beat.line, holdMs);
    }

    this.beatTimer = this.time.delayedCall(holdMs + (beat.tail ?? 300), () => this.runBeat(index + 1));
  }

  // ─── Subtitles ─────────────────────────────────────────────────────────────

  private showSubtitle(line: CutsceneLine, durationMs: number) {
    this.typeTimer?.remove(false);

    const isNarrator = line.speaker === 'narrator';
    const color = SPEAKER_COLOR[line.speaker] ?? '#eef2fb';

    this.speakerTag.setText(isNarrator ? '' : SPEAKER_NAME[line.speaker].toUpperCase());
    this.speakerTag.setColor(color);
    this.speakerTag.setAlpha(isNarrator ? 0 : 1);

    this.subtitle.setColor(isNarrator ? '#dbe3f2' : '#ffffff');
    this.subtitle.setFontStyle(isNarrator ? 'italic' : 'normal');
    this.subtitle.setText('');

    this.captionBg.setAlpha(0);
    this.tweens.add({ targets: this.captionBg, alpha: 1, duration: 220 });

    // Type the line out over roughly the first 70% of the clip so the words
    // land with the voice instead of appearing all at once ahead of it.
    const characters = [...line.text];
    const typeWindow = Math.max(400, durationMs * 0.7);
    const stepMs = Math.max(12, typeWindow / Math.max(characters.length, 1));
    let shown = 0;

    this.typeTimer = this.time.addEvent({
      delay: stepMs,
      repeat: characters.length - 1,
      callback: () => {
        shown += 1;
        this.subtitle.setText(characters.slice(0, shown).join(''));
      }
    });
  }

  private showClock(text: string) {
    this.clockText.setText(text);
    if (this.clockText.alpha < 1) {
      this.tweens.add({ targets: this.clockText, alpha: 1, duration: 300 });
    }
  }

  private hideClockSoon() {
    this.time.delayedCall(1800, () => {
      this.tweens.add({ targets: this.clockText, alpha: 0, duration: 600 });
    });
  }

  // ─── Actors ────────────────────────────────────────────────────────────────

  private spawn(id: string, x: number, y: number, facing: 'up' | 'down' | 'left' | 'right' = 'down'): Actor {
    const existing = this.actor(id);
    if (existing) return existing;

    const npc = NPCS.find((entry) => entry.id === id);
    const sprite = this.add.sprite(x, y, id, facing).setDepth(100).setAlpha(0);

    const label = this.add
      .text(x, y - 30, npc?.name.split(' ')[0] ?? id, {
        fontSize: '11px',
        color: '#ffffff',
        stroke: '#0a0e16',
        strokeThickness: 4,
        fontFamily: "'Segoe UI', Tahoma, sans-serif"
      })
      .setOrigin(0.5)
      .setDepth(200)
      .setAlpha(0);

    this.tweens.add({ targets: [sprite, label], alpha: 1, duration: 420 });

    const actor: Actor = { id, sprite, label };
    this.actors.push(actor);
    return actor;
  }

  private actor(id: string) {
    return this.actors.find((entry) => entry.id === id);
  }

  /** A soft breathing scale so a standing character does not read as a static image. */
  private pulse(actor: Actor) {
    this.tweens.add({
      targets: actor.sprite,
      scaleY: 1.035,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  /** The drive catching the light. */
  private glint(x: number, y: number, color = 0xf3b640) {
    const spark = this.add.circle(x, y, 3, color, 1).setDepth(150);
    this.tweens.add({
      targets: spark,
      scale: 4.5,
      alpha: 0,
      duration: 900,
      ease: 'Cubic.easeOut',
      onComplete: () => spark.destroy()
    });
  }

  private walk(actor: Actor, x: number, y: number, duration: number) {
    this.tweens.killTweensOf(actor.sprite);

    const dx = x - actor.sprite.x;
    const dy = y - actor.sprite.y;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const facing = horizontal ? (dx >= 0 ? 'right' : 'left') : dy >= 0 ? 'down' : 'up';

    actor.sprite.anims.play(`${actor.id}-${facing}-walk`, true);
    this.tweens.add({
      targets: actor.sprite,
      x,
      y,
      duration,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        actor.sprite.anims.stop();
        actor.sprite.setTexture(actor.id, facing);
      }
    });
  }

  private makeAnims(id: string) {
    for (const dir of ['left', 'right', 'down', 'up'] as const) {
      const key = `${id}-${dir}-walk`;
      if (this.anims.exists(key)) continue;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNames(id, { prefix: `${dir}-walk.`, start: 0, end: 3, zeroPad: 3 }),
        frameRate: 5,
        repeat: -1
      });
    }
  }

  private zoomTo(zoom: number, duration: number) {
    this.cameras.main.zoomTo(zoom, duration, 'Sine.easeInOut');
  }

  // ─── Skip / finish ─────────────────────────────────────────────────────────

  private onPointerDown = () => {
    void this.voice.unlock();
    this.finish();
  };

  private onSkipKey = (event: KeyboardEvent) => {
    // M toggles the voice track without ending the scene.
    if (event.key.toLowerCase() === 'm') {
      this.voice.setMuted(!this.voice.isMuted());
      this.skipHint.setText(
        this.voice.isMuted() ? 'SPACE  skip  ·  M  unmute' : 'SPACE  skip  ·  M  mute'
      );
      return;
    }
    void this.voice.unlock();
    this.finish();
  };

  private finish() {
    if (this.finished) return;
    this.finished = true;

    this.beatTimer?.remove(false);
    this.typeTimer?.remove(false);
    this.voice.stop();

    this.tweens.add({ targets: [this.subtitle, this.speakerTag, this.captionBg, this.clockText], alpha: 0, duration: 260 });

    this.cameras.main.fadeOut(520, 0, 0, 0, (_camera: Phaser.Cameras.Scene2D.Camera, progress: number) => {
      if (progress !== 1) return;
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layoutOverlay, this);
      this.voice.dispose();
      this.scene.start('OfficeScene');
    });
  }
}
