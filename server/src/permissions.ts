import type { Role } from './contracts.js'
import { forbidden } from './errors.js'
export type ClubCapability =
  | 'configure'
  | 'invite'
  | 'manageMembers'
  | 'assignRoles'
  | 'moderate'
  | 'manageLibrary'
  | 'manageEvents'
export function can(role: Role, capability: ClubCapability) {
  if (role === 'owner') return true
  if (capability === 'assignRoles') return false
  if (role === 'admin') return true
  return role === 'moderator' && capability === 'moderate'
}
export function assertCapability(role: Role, capability: ClubCapability) {
  if (!can(role, capability)) throw forbidden()
}
export const roleLabels: Record<Role, string> = {
  owner: 'Proprietário',
  admin: 'Administrador',
  moderator: 'Moderador',
  member: 'Membro',
}
