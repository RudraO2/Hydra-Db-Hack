import * as Phaser from 'phaser';
import { NPCS, NPC_SCHEDULES, type NPCId } from '@/data/npcs';
import { useStore } from '@/lib/store';
import { worldEvents } from './worldEvents';

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

const ROOM_LAYOUT = [
  { name: 'Entrance', x: 200, y: 150, w: 500, h: 280 },
  { name: 'OpenWorkspace', x: 820, y: 150, w: 580, h: 280 },
  { name: 'ConferenceRoom', x: 1430, y: 150, w: 500, h: 280 },
  { name: 'CEOOffice', x: 200, y: 520, w: 500, h: 300 },
  { name: 'HROffice', x: 820, y: 520, w: 580, h: 300 },
  { name: 'BreakRoom', x: 1430, y: 520, w: 500, h: 300 },
  { name: 'ITCloset', x: 200, y: 900, w: 500, h: 300 },
  { name: 'AccountsDesk', x: 820, y: 900, w: 580, h: 300 },
  { name: 'Bathroom', x: 1430, y: 900, w: 500, h: 300 }
] as const;

const GAME_SPEED = typeof process !== 'undefined'
  ? Number(process.env.NEXT_PUBLIC_GAME_SPEED ?? 3)
  : 3;

// Each room's position in the 3×3 office grid — used for corridor-aware pathfinding
type GridCoord = { col: 1 | 2 | 3; row: 1 | 2 | 3 };
const ROOM_GRID: Record<string, GridCoord> = {
  Entrance:       { col: 1, row: 1 },
  OpenWorkspace:  { col: 2, row: 1 },
  ConferenceRoom: { col: 3, row: 1 },
  CEOOffice:      { col: 1, row: 2 },
  HROffice:       { col: 2, row: 2 },
  BreakRoom:      { col: 3, row: 2 },
  ITCloset:       { col: 1, row: 3 },
  AccountsDesk:   { col: 2, row: 3 },
  Bathroom:       { col: 3, row: 3 },
};

// Horizontal spine (center Y) of each row — used while crossing vertical corridors
const ROW_CENTER_Y: Record<number, number> = { 1: 290, 2: 670, 3: 1050 };
// Vertical spine (center X) of each column — used while crossing horizontal corridors
const COL_CENTER_X: Record<number, number> = { 1: 450, 2: 1110, 3: 1680 };
// X of the gap between adjacent columns
const COL_CORRIDOR_X: Record<string, number> = { '1-2': 760, '2-3': 1415 };
// Y of the gap between adjacent rows
const ROW_CORRIDOR_Y: Record<string, number> = { '1-2': 475, '2-3': 860 };

const HIDDEN_LAYER_PATTERNS = [
  'collision',
  'interaction',
  'arena blocks',
  'sector blocks',
  'world blocks',
  'spawning blocks',
  'special blocks registry'
];

type NPCState = {
  id: string;
  sprite: Phaser.Physics.Arcade.Sprite;
  label: Phaser.GameObjects.Text;
  bubble: Phaser.GameObjects.Text;
  currentRoom: string;
  speedMultiplier: number;
  waypointRooms: string[];
  proximityInside: boolean;
  proximityRadius: number;
  facing: 'left' | 'right' | 'up' | 'down';
  lastX: number;
  lastY: number;
  lockedForConversation: boolean;
  waypointTimer?: Phaser.Time.TimerEvent;
  bubbleTimer?: Phaser.Time.TimerEvent;
};

type SceneBridge = {
  onInteract: (npcId: string) => void;
  onNPCProximity: (npcId: string, inRange: boolean) => void;
};

function toRoomName(waypoint: string) {
  const key = waypoint.replace(/_/g, '').toLowerCase();
  const match = ROOM_LAYOUT.find((room) => room.name.toLowerCase() === key);
  return match?.name ?? 'OpenWorkspace';
}

export class OfficeScene extends Phaser.Scene {
  private bridge: SceneBridge;
  private player!: Phaser.Physics.Arcade.Sprite;
  private wasd!: { [k: string]: Phaser.Input.Keyboard.Key };
  private interactKey!: Phaser.Input.Keyboard.Key;
  private npcs: NPCState[] = [];
  private nearestNpcId: string | null = null;
  private map!: Phaser.Tilemaps.Tilemap;
  private gossipQueue: Array<{
    npc1Id: string;
    npc2Id: string;
    turns: Array<{ speakerId: string; text: string }>;
  }> = [];
  private gossipPlaybackActive = false;

  constructor(bridge: SceneBridge) {
    super('OfficeScene');
    this.bridge = bridge;
  }

  preload() {
    this.load.tilemapTiledJSON(MAP_KEY, MAP_JSON_PATH);

    for (const [tilesetName, src] of Object.entries(TILESET_SOURCES)) {
      this.load.image(tilesetName, src);
    }

    for (const npc of NPCS) {
      this.load.atlas(npc.id, `/assets/sprites/${npc.id}.png`, CHARACTER_ATLAS_PATH);
    }
  }

  create() {
    this.map = this.make.tilemap({ key: MAP_KEY });
    const tilesets = this.map.tilesets
      .map((set) => this.map.addTilesetImage(set.name, set.name))
      .filter(Boolean) as Phaser.Tilemaps.Tileset[];

    let depth = 0;
    for (const layerDef of this.map.layers) {
      const layer = this.map.createLayer(layerDef.name, tilesets, 0, 0);
      if (!layer) continue;

      layer.setDepth(depth++);

      const layerName = layerDef.name.toLowerCase().trim();
      const isHiddenHelperLayer = HIDDEN_LAYER_PATTERNS.some((pattern) => layerName.includes(pattern));
      if (isHiddenHelperLayer) {
        layer.setVisible(false);
      }
    }

    this.physics.world.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);

    const entranceSpawn = this.randomPointInRoom('Entrance');
    useStore.getState().setPlayerLocation('Entrance');

    this.player = this.physics.add
      .sprite(entranceSpawn.x, entranceSpawn.y, 'dev', 'down');
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(100);

    this.createCharacterAnims('dev');

    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as any;
    this.interactKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);

    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);

    for (const npc of NPCS) {
      this.createCharacterAnims(npc.id);

      const room = toRoomName(npc.waypoints[0] ?? 'open_workspace');
      const spawn = this.randomPointInRoom(room);
      const sprite = this.physics.add.sprite(spawn.x, spawn.y, npc.id, 'down');
      sprite.setCollideWorldBounds(true);
      sprite.setDepth(90);

      const label = this.add
        .text(spawn.x, spawn.y - 24, npc.name.split(' ')[0], {
          color: '#ffffff',
          fontSize: '12px',
          stroke: '#10151f',
          strokeThickness: 4
        })
        .setOrigin(0.5)
        .setDepth(200);

      const bubble = this.add
        .text(spawn.x, spawn.y - 54, '', {
          color: '#10151f',
          fontSize: '11px',
          fontStyle: 'bold',
          fontFamily: 'monospace',
          backgroundColor: '#ffffff',
          padding: { left: 8, right: 8, top: 6, bottom: 6 },
          align: 'center',
          wordWrap: { width: 150, useAdvancedWrap: true }
        })
        .setOrigin(0.5, 1)
        .setDepth(210);

      const state: NPCState = {
        id: npc.id,
        sprite,
        label,
        bubble,
        currentRoom: room,
        speedMultiplier: 1,
        waypointRooms: npc.waypoints.map(toRoomName),
        proximityInside: false,
        proximityRadius: 80,
        facing: 'down',
        lastX: spawn.x,
        lastY: spawn.y,
        lockedForConversation: false
      };

      this.npcs.push(state);
      this.setIdleBubble(state);
      this.positionNPCUI(state);
      this.scheduleNextWaypoint(state);
    }

    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => useStore.getState().tickGameTime()
    });

    this.time.addEvent({
      delay: 2000,
      loop: true,
      callback: () => {
        for (const npc of this.npcs) {
          const room = this.findRoomForPoint(npc.sprite.x, npc.sprite.y);
          useStore.getState().setNPCPosition(npc.id, room);
        }
      }
    });

    worldEvents.on('npc:behavior_change', this.onBehaviorChange);
    worldEvents.on('npc:conversation_start', this.onConversationStart);
    worldEvents.on('npc:conversation_end', this.onConversationEnd);
    worldEvents.on('npc:gossip_session', this.onGossipSession);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      worldEvents.off('npc:behavior_change', this.onBehaviorChange);
      worldEvents.off('npc:conversation_start', this.onConversationStart);
      worldEvents.off('npc:conversation_end', this.onConversationEnd);
      worldEvents.off('npc:gossip_session', this.onGossipSession);
    });
  }

  update() {
    const conversationOpen = Boolean(useStore.getState().activeNPC);

    if (conversationOpen) {
      this.player.setVelocity(0, 0);
      this.player.anims.stop();
      this.player.setTexture('dev', 'down');
      return;
    }

    const speed = 180;
    let vx = 0;
    let vy = 0;

    if (this.wasd.A.isDown) vx -= speed;
    if (this.wasd.D.isDown) vx += speed;
    if (this.wasd.W.isDown) vy -= speed;
    if (this.wasd.S.isDown) vy += speed;

    this.player.setVelocity(vx, vy);

    if (Math.abs(vx) > Math.abs(vy)) {
      this.player.anims.play(vx > 0 ? 'dev-right-walk' : 'dev-left-walk', true);
    } else if (Math.abs(vy) > 0) {
      this.player.anims.play(vy > 0 ? 'dev-down-walk' : 'dev-up-walk', true);
    } else {
      this.player.anims.stop();
      this.player.setTexture('dev', 'down');
    }

    let nearest: { id: string; dist: number } | null = null;
    for (const npc of this.npcs) {
      this.positionNPCUI(npc);
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, npc.sprite.x, npc.sprite.y);
      const inRange = dist <= npc.proximityRadius;

      if (inRange && (!nearest || dist < nearest.dist)) {
        nearest = { id: npc.id, dist };
      }

      if (inRange !== npc.proximityInside) {
        npc.proximityInside = inRange;
        this.bridge.onNPCProximity(npc.id, inRange);
      }
    }

    this.nearestNpcId = nearest?.id ?? null;
    useStore.getState().setPlayerLocation(this.findRoomForPoint(this.player.x, this.player.y));

    if (
      Phaser.Input.Keyboard.JustDown(this.interactKey) &&
      this.nearestNpcId &&
      !useStore.getState().activeNPC
    ) {
      this.bridge.onInteract(this.nearestNpcId);
    }
  }

  private onBehaviorChange = (payload?: { npcId: string; speedMultiplier?: number; newWaypoints?: string[] }) => {
    if (!payload?.npcId) return;

    const npc = this.npcs.find((entry) => entry.id === payload.npcId);
    if (!npc) return;

    if (typeof payload.speedMultiplier === 'number') {
      npc.speedMultiplier = Math.max(0.2, payload.speedMultiplier);
    }

    if (payload.newWaypoints?.length) {
      npc.waypointRooms = payload.newWaypoints.map(toRoomName);
    }
  };

  private onConversationStart = (payload?: { npcId?: string }) => {
    if (!payload?.npcId) return;

    const npc = this.npcs.find((entry) => entry.id === payload.npcId);
    if (!npc) return;

    npc.lockedForConversation = true;
    this.setKeyboardLock(true);
    npc.waypointTimer?.remove(false);
    npc.waypointTimer = undefined;
    this.tweens.killTweensOf(npc.sprite);
    this.setIdleFrame(npc);
    this.setBubble(npc, 'listening...', 'idle');
  };

  private onConversationEnd = (payload?: { npcId?: string }) => {
    if (!payload?.npcId) return;

    const npc = this.npcs.find((entry) => entry.id === payload.npcId);
    if (!npc) return;

    npc.lockedForConversation = false;
    this.setKeyboardLock(false);
    this.setIdleFrame(npc);
    this.setIdleBubble(npc);
    this.scheduleNextWaypoint(npc);
  };

  private setKeyboardLock(locked: boolean) {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;

    // Reset key state on both transitions so held keys don't leak movement
    // and E can be pressed cleanly again after closing the conversation.
    keyboard.resetKeys();
    keyboard.enabled = !locked;
  }

  private onGossipSession = (payload?: {
    npc1Id?: string;
    npc2Id?: string;
    turns?: Array<{ speakerId: string; text: string }>;
  }) => {
    if (!payload?.npc1Id || !payload?.npc2Id || !Array.isArray(payload.turns) || payload.turns.length === 0) {
      return;
    }

    this.gossipQueue.push({
      npc1Id: payload.npc1Id,
      npc2Id: payload.npc2Id,
      turns: payload.turns
    });

    if (!this.gossipPlaybackActive) {
      this.playNextGossipSession();
    }
  };

  private createCharacterAnims(texture: string) {
    const directions = ['left', 'right', 'down', 'up'] as const;

    for (const direction of directions) {
      const key = `${texture}-${direction}-walk`;
      if (this.anims.exists(key)) continue;

      this.anims.create({
        key,
        frames: this.anims.generateFrameNames(texture, {
          prefix: `${direction}-walk.`,
          start: 0,
          end: 3,
          zeroPad: 3
        }),
        frameRate: 4,
        repeat: -1
      });
    }
  }

  private scheduleNextWaypoint(npc: NPCState) {
    npc.waypointTimer?.remove(false);
    npc.waypointTimer = undefined;
    if (npc.lockedForConversation) return;

    const gameHour = Math.floor(useStore.getState().gameTimeMinutes / 60);
    const scheduledRoom = this.pickScheduledRoom(npc.id as NPCId, gameHour, npc.waypointRooms);
    const isAtScheduledRoom = scheduledRoom === npc.currentRoom;

    // Dwell expressed as game-minutes so it scales correctly with GAME_SPEED.
    // NPCs linger at their scheduled home base; they pass through incidental rooms quickly.
    const gameMinutes = isAtScheduledRoom
      ? Phaser.Math.Between(45, 90)
      : Phaser.Math.Between(10, 25);
    const dwellMs = Math.round((gameMinutes / GAME_SPEED) * 1000);

    npc.waypointTimer = this.time.delayedCall(dwellMs, () => {
      npc.waypointTimer = undefined;
      if (npc.lockedForConversation) return;

      const hour = Math.floor(useStore.getState().gameTimeMinutes / 60);
      const destRoom = this.pickScheduledRoom(npc.id as NPCId, hour, npc.waypointRooms);
      const target = this.randomPointInRoom(destRoom);
      this.moveNPCViaCorridor(npc, target, destRoom);
    });
  }

  private pickScheduledRoom(npcId: NPCId, gameHour: number, fallbackRooms: string[]): string {
    // Social magnetism: Dev drifts toward wherever Priya currently is (~25% of moves)
    if (npcId === 'dev' && Math.random() < 0.25) {
      const priyaRoom = useStore.getState().npcPositions['priya'];
      if (priyaRoom) return priyaRoom;
    }

    const slots = NPC_SCHEDULES[npcId];
    const active = slots?.filter((s) => gameHour >= s.fromHour && gameHour < s.toHour) ?? [];

    if (active.length === 0) {
      return Phaser.Utils.Array.GetRandom(fallbackRooms) ?? 'OpenWorkspace';
    }

    const total = active.reduce((sum, s) => sum + s.weight, 0);
    let rand = Math.random() * total;
    for (const slot of active) {
      rand -= slot.weight;
      if (rand <= 0) return toRoomName(slot.room);
    }
    return toRoomName(active[0].room);
  }

  private buildCorridorPath(
    srcRoom: string,
    dstRoom: string,
    target: { x: number; y: number }
  ): Array<{ x: number; y: number }> {
    const src = ROOM_GRID[srcRoom];
    const dst = ROOM_GRID[dstRoom];

    // Same room or unknown — go straight to target
    if (!src || !dst || (src.col === dst.col && src.row === dst.row)) {
      return [target];
    }

    const waypoints: Array<{ x: number; y: number }> = [];
    let col = src.col as number;
    let row = src.row as number;

    // Cross vertical corridors first (move to destination column along current row's spine)
    while (col !== dst.col) {
      const nextCol = col < dst.col ? col + 1 : col - 1;
      const key = `${Math.min(col, nextCol)}-${Math.max(col, nextCol)}`;
      waypoints.push({ x: COL_CORRIDOR_X[key], y: ROW_CENTER_Y[row] });
      col = nextCol;
    }

    // Then cross horizontal corridors (move to destination row along destination column's spine)
    while (row !== dst.row) {
      const nextRow = row < dst.row ? row + 1 : row - 1;
      const key = `${Math.min(row, nextRow)}-${Math.max(row, nextRow)}`;
      waypoints.push({ x: COL_CENTER_X[col], y: ROW_CORRIDOR_Y[key] });
      row = nextRow;
    }

    waypoints.push(target);
    return waypoints;
  }

  private playDirectionalAnim(npc: NPCState, vx: number, vy: number) {
    const { sprite, id } = npc;

    if (Math.abs(vx) > Math.abs(vy)) {
      npc.facing = vx > 0 ? 'right' : 'left';
      sprite.anims.play(`${id}-${npc.facing}-walk`, true);
      return;
    }

    if (Math.abs(vy) > 0) {
      npc.facing = vy > 0 ? 'down' : 'up';
      sprite.anims.play(`${id}-${npc.facing}-walk`, true);
      return;
    }

    sprite.anims.stop();
    sprite.setTexture(id, npc.facing);
  }

  private moveNPCViaCorridor(npc: NPCState, target: { x: number; y: number }, nextRoom: string) {
    if (npc.lockedForConversation) {
      this.setIdleFrame(npc);
      return;
    }

    const waypoints = this.buildCorridorPath(npc.currentRoom, nextRoom, target);
    const speed = Math.max(45, 95 * npc.speedMultiplier);

    const runSegment = (index: number) => {
      if (index >= waypoints.length) {
        npc.currentRoom = nextRoom;
        this.setIdleFrame(npc);
        this.setIdleBubble(npc);
        this.scheduleNextWaypoint(npc);
        return;
      }

      const wp = waypoints[index];
      const dx = wp.x - npc.sprite.x;
      const dy = wp.y - npc.sprite.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 4) {
        runSegment(index + 1);
        return;
      }

      const duration = Math.max(200, (distance / speed) * 1000);
      npc.lastX = npc.sprite.x;
      npc.lastY = npc.sprite.y;

      this.tweens.add({
        targets: npc.sprite,
        x: wp.x,
        y: wp.y,
        ease: 'Linear',
        duration,
        onUpdate: () => {
          const ddx = npc.sprite.x - npc.lastX;
          const ddy = npc.sprite.y - npc.lastY;
          this.playDirectionalAnim(npc, ddx, ddy);
          npc.lastX = npc.sprite.x;
          npc.lastY = npc.sprite.y;
          this.positionNPCUI(npc);
        },
        onComplete: () => {
          npc.lastX = npc.sprite.x;
          npc.lastY = npc.sprite.y;
          runSegment(index + 1);
        }
      });
    };

    runSegment(0);
  }

  private setIdleFrame(npc: NPCState) {
    npc.sprite.anims.stop();
    npc.sprite.setTexture(npc.id, npc.facing);
  }

  private positionNPCUI(npc: NPCState) {
    npc.label.setPosition(npc.sprite.x, npc.sprite.y - 24);
    npc.bubble.setPosition(npc.sprite.x, npc.sprite.y - 52);
  }

  private initialsForNPC(npcId: string) {
    const npc = NPCS.find((entry) => entry.id === npcId);
    if (!npc) return npcId.slice(0, 2).toUpperCase();

    return npc.name
      .split(/\s+/)
      .map((part) => part[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  private idleThoughtForRoom(roomName: string) {
    switch (roomName) {
      case 'Entrance':
        return 'arriving';
      case 'OpenWorkspace':
        return 'working';
      case 'ConferenceRoom':
        return 'meeting';
      case 'CEOOffice':
        return 'planning';
      case 'HROffice':
        return 'notes';
      case 'BreakRoom':
        return 'coffee';
      case 'ITCloset':
        return 'debugging';
      case 'AccountsDesk':
        return 'numbers';
      case 'Bathroom':
        return 'brb';
      default:
        return '...';
    }
  }

  private shortenBubbleText(text: string, maxLength = 64) {
    const compact = text.replace(/\s+/g, ' ').trim();
    if (compact.length <= maxLength) {
      return compact;
    }

    return `${compact.slice(0, maxLength - 3).trimEnd()}...`;
  }

  private setBubble(npc: NPCState, text: string, mode: 'idle' | 'speech') {
    npc.bubble.setStyle({
      backgroundColor: mode === 'speech' ? '#fff5cf' : '#ffffff',
      color: '#10151f'
    });
    npc.bubble.setText(`${this.initialsForNPC(npc.id)}: ${text}`);
    this.positionNPCUI(npc);
  }

  private setIdleBubble(npc: NPCState) {
    npc.bubbleTimer?.remove(false);
    npc.bubbleTimer = undefined;
    this.setBubble(npc, this.idleThoughtForRoom(npc.currentRoom), 'idle');
  }

  private showSpeechBubble(npc: NPCState, text: string, duration: number) {
    npc.bubbleTimer?.remove(false);
    npc.bubbleTimer = undefined;
    this.setBubble(npc, this.shortenBubbleText(text), 'speech');
    npc.bubbleTimer = this.time.delayedCall(duration, () => {
      npc.bubbleTimer = undefined;
      this.setIdleBubble(npc);
    });
  }

  private faceNPCsTowardEachOther(left: NPCState, right: NPCState) {
    const deltaX = right.sprite.x - left.sprite.x;
    const deltaY = right.sprite.y - left.sprite.y;

    if (Math.abs(deltaX) >= Math.abs(deltaY)) {
      left.facing = deltaX >= 0 ? 'right' : 'left';
      right.facing = deltaX >= 0 ? 'left' : 'right';
    } else {
      left.facing = deltaY >= 0 ? 'down' : 'up';
      right.facing = deltaY >= 0 ? 'up' : 'down';
    }

    this.setIdleFrame(left);
    this.setIdleFrame(right);
  }

  private playNextGossipSession() {
    const session = this.gossipQueue.shift();
    if (!session) {
      this.gossipPlaybackActive = false;
      return;
    }

    const npc1 = this.npcs.find((entry) => entry.id === session.npc1Id);
    const npc2 = this.npcs.find((entry) => entry.id === session.npc2Id);

    if (!npc1 || !npc2) {
      this.playNextGossipSession();
      return;
    }

    this.gossipPlaybackActive = true;
    this.faceNPCsTowardEachOther(npc1, npc2);

    const turnDuration = 2200;
    let delay = 0;

    for (const turn of session.turns) {
      this.time.delayedCall(delay, () => {
        const speaker = this.npcs.find((entry) => entry.id === turn.speakerId);
        const listener = turn.speakerId === npc1.id ? npc2 : npc1;
        if (!speaker) return;

        this.faceNPCsTowardEachOther(speaker, listener);
        this.showSpeechBubble(speaker, turn.text, turnDuration - 250);
        listener.bubbleTimer?.remove(false);
        listener.bubbleTimer = undefined;
        this.setBubble(listener, '...', 'idle');
      });
      delay += turnDuration;
    }

    this.time.delayedCall(delay + 150, () => {
      this.setIdleBubble(npc1);
      this.setIdleBubble(npc2);
      this.gossipPlaybackActive = false;
      this.playNextGossipSession();
    });
  }

  private randomPointInRoom(roomName: string) {
    const room = ROOM_LAYOUT.find((entry) => entry.name === roomName) ?? ROOM_LAYOUT[1];
    return {
      x: Phaser.Math.Between(room.x + 20, room.x + room.w - 20),
      y: Phaser.Math.Between(room.y + 20, room.y + room.h - 20)
    };
  }

  private findRoomForPoint(x: number, y: number) {
    const room = ROOM_LAYOUT.find((entry) => new Phaser.Geom.Rectangle(entry.x, entry.y, entry.w, entry.h).contains(x, y));
    return room?.name ?? 'OpenWorkspace';
  }
}
