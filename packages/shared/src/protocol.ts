/**
 * Binary WebSocket Protocol Constants for SyncForge CRDT Synchronization
 */

export const MESSAGE_SYNC = 0;
export const MESSAGE_AWARENESS = 1;
export const MESSAGE_AUTH = 2;
export const MESSAGE_QUERY_AWARENESS = 3;

export const SYNC_STEP_1 = 0;
export const SYNC_STEP_2 = 1;
export const SYNC_UPDATE = 2;

export const DEFAULT_ROOM_NAME = 'syncforge-default';

export const USER_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Emerald
  '#8B5CF6', // Purple
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#F97316', // Orange
  '#6366F1', // Indigo
  '#14B8A6', // Teal
  '#EF4444', // Red
];

export function getRandomColor(): string {
  return USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
}

export function getRandomName(): string {
  const adjectives = [
    'Swift', 'Cosmic', 'Clever', 'Agile', 'Brave',
    'Bright', 'Stellar', 'Calm', 'Nimble', 'Vivid',
    'Electric', 'Dynamic', 'Silent', 'Wise', 'Bold'
  ];
  const animals = [
    'Falcon', 'Otter', 'Fox', 'Lynx', 'Panda',
    'Hawk', 'Dolphin', 'Tiger', 'Eagle', 'Koala',
    'Wolf', 'Badger', 'Jaguar', 'Cheetah', 'Raven'
  ];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  return `${adj} ${animal}`;
}
