import type { Book, ClubEvent, ForumTopic, Member } from '../types/domain'

export const currentBook: Book = {
  id: 'torto-arado',
  title: 'Torto Arado',
  author: 'Itamar Vieira Junior',
  category: 'Romance brasileiro',
  pages: 264,
  progress: 62,
  cover: { from: '#321b3f', to: '#8a4d62', mark: 'TA' },
  status: 'reading',
}

export const books: Book[] = [
  currentBook,
  {
    id: 'agua-viva',
    title: 'Água Viva',
    author: 'Clarice Lispector',
    category: 'Ficção brasileira',
    pages: 96,
    rating: 4.8,
    cover: { from: '#195d68', to: '#74b3a7', mark: 'AV' },
    status: 'finished',
  },
  {
    id: 'cem-anos',
    title: 'Cem Anos de Solidão',
    author: 'Gabriel García Márquez',
    category: 'Realismo mágico',
    pages: 448,
    rating: 4.9,
    cover: { from: '#9b5c2c', to: '#e0a84f', mark: 'CS' },
    status: 'finished',
  },
  {
    id: 'quarto-despejo',
    title: 'Quarto de Despejo',
    author: 'Carolina Maria de Jesus',
    category: 'Diário',
    pages: 200,
    cover: { from: '#38434c', to: '#8b7763', mark: 'QD' },
    status: 'available',
  },
  {
    id: 'pequeno-principe',
    title: 'O Pequeno Príncipe',
    author: 'Antoine de Saint-Exupéry',
    category: 'Fábula',
    pages: 96,
    rating: 4.6,
    cover: { from: '#235b86', to: '#91bdd7', mark: 'PP' },
    status: 'finished',
  },
]

export const events: ClubEvent[] = [
  {
    id: 'event-1',
    day: '24',
    month: 'OUT',
    fullDate: '24 de outubro de 2026',
    time: '19:30',
    title: 'Conversa sobre Torto Arado',
    location: 'Café Ipê · Rua das Flores, 42',
    attendees: 8,
    rsvp: 'yes',
    photos: 0,
  },
  {
    id: 'event-2',
    day: '07',
    month: 'NOV',
    fullDate: '7 de novembro de 2026',
    time: '16:00',
    title: 'Troca de livros & café',
    location: 'Casa da Marina',
    attendees: 6,
    rsvp: null,
    photos: 12,
  },
  {
    id: 'event-3',
    day: '21',
    month: 'NOV',
    fullDate: '21 de novembro de 2026',
    time: '19:00',
    title: 'Encontro de novembro',
    location: 'A definir',
    attendees: 3,
    rsvp: 'maybe',
    photos: 0,
  },
]

export const forumTopics: ForumTopic[] = [
  {
    id: 'topic-1',
    author: 'Lia Martins',
    initials: 'LM',
    title: 'A relação entre as irmãs',
    excerpt: 'Fiquei pensando em como o silêncio também funciona como uma linguagem...',
    comments: 14,
    reactions: 9,
    age: 'há 2 h',
    spoiler: true,
    tag: 'Torto Arado',
  },
  {
    id: 'topic-2',
    author: 'Ravi Almeida',
    initials: 'RA',
    title: 'Qual trecho mais marcou vocês?',
    excerpt: 'O capítulo 8 me fez voltar algumas páginas. Quero muito ouvir outras leituras.',
    comments: 8,
    reactions: 12,
    age: 'ontem',
    spoiler: false,
    tag: 'Leitura do mês',
  },
  {
    id: 'topic-3',
    author: 'Bia Costa',
    initials: 'BC',
    title: 'Sugestões para o próximo encontro',
    excerpt: 'Podemos levar uma passagem favorita e fazer uma leitura coletiva?',
    comments: 5,
    reactions: 7,
    age: 'há 2 dias',
    spoiler: false,
    tag: 'Encontro',
  },
]

export const members: Member[] = [
  { id: 'm1', name: 'Marina Alves', initials: 'MA', role: 'owner', booksRead: 18, status: 'active' },
  { id: 'm2', name: 'Lia Martins', initials: 'LM', role: 'admin', booksRead: 15, status: 'active' },
  { id: 'm3', name: 'Ravi Almeida', initials: 'RA', role: 'member', booksRead: 12, status: 'active' },
  { id: 'm4', name: 'Bia Costa', initials: 'BC', role: 'member', booksRead: 10, status: 'active' },
  { id: 'm5', name: 'Tom Nunes', initials: 'TN', role: 'member', booksRead: 8, status: 'active' },
  { id: 'm6', name: 'Nina Freire', initials: 'NF', role: 'member', booksRead: 0, status: 'invited' },
]

export const nominations = [
  { id: 'n1', title: 'A Vida Invisível de Eurídice Gusmão', author: 'Martha Batalha', member: 'Lia', initials: 'LM', votes: 5, color: '#b45f55' },
  { id: 'n2', title: 'O Avesso da Pele', author: 'Jeferson Tenório', member: 'Ravi', initials: 'RA', votes: 4, color: '#476c72' },
  { id: 'n3', title: 'Niketche', author: 'Paulina Chiziane', member: 'Bia', initials: 'BC', votes: 3, color: '#8b6a3d' },
]

export const readingHistory = [
  { month: 'SET', year: '2026', title: 'Água Viva', author: 'Clarice Lispector', chosenBy: 'Lia Martins', method: 'Sorteio', rating: 4.8, color: '#28727a' },
  { month: 'AGO', year: '2026', title: 'Cem Anos de Solidão', author: 'Gabriel García Márquez', chosenBy: 'Ravi Almeida', method: 'Indicação do grupo', rating: 4.9, color: '#b6732e' },
  { month: 'JUL', year: '2026', title: 'Quarto de Despejo', author: 'Carolina Maria de Jesus', chosenBy: 'Marina Alves', method: 'Curadoria', rating: 4.7, color: '#5d625f' },
  { month: 'JUN', year: '2026', title: 'O Filho de Mil Homens', author: 'Valter Hugo Mãe', chosenBy: 'Tom Nunes', method: 'Sorteio', rating: 4.5, color: '#735381' },
]
