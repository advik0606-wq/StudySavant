export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  createdAt: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
}

export interface Flashcard {
  front: string;
  back: string;
}

export interface StudySet {
  id: string;
  userId: string;
  title: string;
  content: string;
  quiz: QuizQuestion[];
  flashcards: Flashcard[];
  createdAt: string;
}

export type ViewState = 'home' | 'upload' | 'study-set' | 'contact';
