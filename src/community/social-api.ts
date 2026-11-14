import type {User} from 'firebase/auth'
import {apiRequest,publicRequest} from '../auth/api'
export const postBase=(clubId:string|null)=>clubId===null?'/public/posts':`/clubs/${clubId}/posts`
export const mediaBase=(clubId:string|null)=>clubId===null?'/public/media':`/clubs/${clubId}/media`
export function socialRead<T>(user:User|null,path:string){return user?.emailVerified?apiRequest<T>(user,path):publicRequest<T>(path)}
