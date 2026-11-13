export type Role = 'owner' | 'member'
export interface UserProfile { id: string; email: string; name: string }
export interface Club { id: string; name: string; timezone: string; role: Role }
export interface Session { user: UserProfile; clubs: Club[] }
export interface Member { id: string; name: string; role: Role; status: 'active' | 'removed' }
export interface Invite {
  id: string; email: string | null; maxUses: number; uses: number
  expiresAt: string; revokedAt: string | null; createdAt: string
}
export interface CreatedInvite extends Invite { token: string }
export interface ClubDetails { club: Club; members: Member[] }
export interface ApiErrorBody { error: { code: string; message: string } }
