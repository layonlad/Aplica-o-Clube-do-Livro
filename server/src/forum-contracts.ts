import {z} from 'zod'
import {pageInput} from './pagination.js'
import type {Page,PostMedia} from './community-contracts.js'
const mediaIds=z.array(z.uuid()).max(4).default([]).refine(ids=>new Set(ids).size===ids.length)
export const topicInput=z.object({title:z.string().trim().min(1).max(150),body:z.string().trim().min(1).max(5000),spoiler:z.boolean().default(false),bookId:z.uuid().nullable().optional(),chapter:z.string().trim().max(200).default(''),mediaIds}).strict()
export const forumQuery=pageInput.extend({q:z.string().trim().min(2).max(100).optional(),bookId:z.uuid().optional()}).strict()
export const replyInput=z.object({body:z.string().trim().min(1).max(5000),spoiler:z.boolean().default(false),mediaIds}).strict()
export interface ForumTopic {id:string;title:string;body:string;spoiler:boolean;bookId:string|null;bookTitle:string;bookAuthor:string;chapter:string;pinned:boolean;closed:boolean;version:number;createdAt:string;updatedAt:string;author:{id:string;name:string};replies:number;likes:number;liked:boolean;canEdit:boolean;canDelete:boolean;canModerate:boolean;media:PostMedia[]}
export interface ForumReply {id:string;body:string;spoiler:boolean;version:number;createdAt:string;author:{id:string;name:string};canDelete:boolean;media:PostMedia[]}
export type ForumPage=Page<ForumTopic>&{pinned:ForumTopic[]}
