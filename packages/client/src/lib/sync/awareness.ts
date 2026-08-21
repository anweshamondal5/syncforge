import { UserProfile } from '@syncforge/shared';
import { getRandomColor, getRandomName } from '@syncforge/shared';

const SESSION_KEY = 'syncforge_session_user';

export function getOrCreateUserProfile(): UserProfile {
  try {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    // Ignore session storage errors
  }

  const newProfile: UserProfile = {
    id: `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: getRandomName(),
    color: getRandomColor(),
  };

  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(newProfile));
  } catch (e) {
    // Ignore storage quota errors
  }

  return newProfile;
}

export function saveUserProfile(profile: UserProfile): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(profile));
  } catch (e) {
    // Ignore
  }
}
