import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Plus, 
  Brain, 
  Layers, 
  MessageSquare, 
  LogOut, 
  User as UserIcon,
  ChevronRight,
  Loader2,
  CheckCircle2,
  X,
  Menu,
  Upload,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
import { auth, signIn, logOut, db } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, setDoc, getDocFromServer } from 'firebase/firestore';
import { generateStudyMaterials } from './lib/gemini';
import { StudySet, ViewState } from './types';
import confetti from 'canvas-confetti';

// --- Error Handling ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Components ---

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.error?.message || "");
        if (parsed.error) errorMessage = `Database Error: ${parsed.error}`;
      } catch {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
          <div className="glass p-8 rounded-3xl max-w-md w-full text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <X size={32} />
            </div>
            <h2 className="text-2xl font-display font-bold mb-4">Application Error</h2>
            <p className="text-zinc-600 mb-8">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-zinc-900 text-white py-3 rounded-xl font-bold hover:bg-zinc-800 transition-all"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const Navbar = ({ user, setView, activeView }: { user: User | null, setView: (v: ViewState) => void, activeView: ViewState }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-zinc-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('home')}>
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
              <Brain size={24} />
            </div>
            <span className="text-xl font-display font-bold tracking-tight">StudySavant</span>
          </div>

          <div className="hidden md:flex items-center gap-8">
            <button 
              onClick={() => setView('home')}
              className={`text-sm font-medium transition-colors ${activeView === 'home' ? 'text-indigo-600' : 'text-zinc-600 hover:text-zinc-900'}`}
            >
              My Library
            </button>
            <button 
              onClick={() => setView('contact')}
              className={`text-sm font-medium transition-colors ${activeView === 'contact' ? 'text-indigo-600' : 'text-zinc-600 hover:text-zinc-900'}`}
            >
              Contact Us
            </button>
            {user ? (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 rounded-full border border-zinc-200">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="" className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
                  ) : (
                    <UserIcon size={16} className="text-zinc-500" />
                  )}
                  <span className="text-xs font-medium text-zinc-700 max-w-[100px] truncate">{user.displayName}</span>
                </div>
                <button onClick={logOut} className="text-zinc-400 hover:text-red-500 transition-colors">
                  <LogOut size={20} />
                </button>
              </div>
            ) : (
              <button 
                onClick={signIn}
                className="bg-zinc-900 text-white px-5 py-2 rounded-full text-sm font-medium hover:bg-zinc-800 transition-all"
              >
                Sign In
              </button>
            )}
          </div>

          <div className="md:hidden">
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="text-zinc-600">
              <Menu size={24} />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-white border-b border-zinc-200 overflow-hidden"
          >
            <div className="px-4 pt-2 pb-6 space-y-2">
              <button 
                onClick={() => { setView('home'); setIsMenuOpen(false); }}
                className="block w-full text-left px-3 py-2 text-base font-medium text-zinc-700 hover:bg-zinc-50 rounded-lg"
              >
                My Library
              </button>
              <button 
                onClick={() => { setView('contact'); setIsMenuOpen(false); }}
                className="block w-full text-left px-3 py-2 text-base font-medium text-zinc-700 hover:bg-zinc-50 rounded-lg"
              >
                Contact Us
              </button>
              {!user && (
                <button 
                  onClick={() => { signIn(); setIsMenuOpen(false); }}
                  className="block w-full text-center mt-4 bg-indigo-600 text-white px-3 py-3 rounded-lg font-medium"
                >
                  Sign In
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

const NoteUpload = ({ onComplete }: { onComplete: (set: StudySet) => void }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [image, setImage] = useState<{ data: string, mimeType: string } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [error, setError] = useState('');

  const extractTextFromPDF = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += pageText + '\n';
    }
    
    return fullText;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsReadingFile(true);
    setError('');
    setImage(null);

    try {
      let text = '';
      const fileType = file.type;

      if (fileType === 'application/pdf') {
        text = await extractTextFromPDF(file);
      } else if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        text = result.value;
      } else if (fileType.startsWith('image/')) {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        const base64 = await base64Promise;
        setImage({ 
          data: base64.split(',')[1], 
          mimeType: fileType 
        });
        text = `[Image uploaded: ${file.name}]`;
      } else if (fileType === 'text/plain' || file.name.endsWith('.md') || file.name.endsWith('.txt')) {
        text = await file.text();
      } else {
        // Try reading as text for unknown types
        try {
          text = await file.text();
        } catch {
          throw new Error('Unsupported file type. Please upload an image file.');
        }
      }

      if (!text.trim() && !fileType.startsWith('image/')) {
        throw new Error('The file seems to be empty or could not be read.');
      }

      setContent(text);
      if (!title) {
        setTitle(file.name.replace(/\.[^/.]+$/, ""));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to read file.');
    } finally {
      setIsReadingFile(false);
    }
  };

  const handleGenerate = async () => {
    if (!title || (!content && !image)) {
      setError('Please provide a title and some content or an image.');
      return;
    }

    setIsGenerating(true);
    setError('');

    try {
      const { quiz, flashcards } = await generateStudyMaterials(
        content, 
        image?.data, 
        image?.mimeType
      );
      
      const studySetData = {
        userId: auth.currentUser?.uid,
        title,
        content: content || (image ? `[Study material generated from image: ${title}]` : ''),
        quiz,
        flashcards,
        createdAt: new Date().toISOString()
      };

      try {
        const docRef = await addDoc(collection(db, 'studySets'), studySetData);
        onComplete({ id: docRef.id, ...studySetData } as StudySet);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'studySets');
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto pt-24 pb-12 px-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-3xl p-8 md:p-12"
      >
        <div className="mb-8">
          <h2 className="text-3xl font-display font-bold mb-2">Create New Study Set</h2>
          <p className="text-zinc-500">Upload a document or paste your notes below.</p>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-zinc-700 mb-2">Title</label>
              <input 
                type="text" 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Biology Chapter 4: Photosynthesis"
                className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-zinc-700 mb-2">Upload Document or Image</label>
              <div className="relative group">
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="border-2 border-dashed border-zinc-200 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 group-hover:border-indigo-400 group-hover:bg-indigo-50/30 transition-all">
                  {isReadingFile ? (
                    <Loader2 className="animate-spin text-indigo-600" size={32} />
                  ) : image ? (
                    <div className="relative">
                      <img src={`data:${image.mimeType};base64,${image.data}`} alt="Preview" className="w-20 h-20 object-cover rounded-lg shadow-sm" />
                      <div className="absolute -top-2 -right-2 bg-indigo-600 text-white rounded-full p-1 shadow-md">
                        <CheckCircle2 size={12} />
                      </div>
                    </div>
                  ) : (
                    <Upload className="text-zinc-400 group-hover:text-indigo-500" size={32} />
                  )}
                  <div className="text-center">
                    <p className="font-bold text-zinc-700">Click to upload or drag and drop</p>
                    <p className="text-xs text-zinc-400">Supports only JPEG and image files</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-semibold text-zinc-700">Notes Content</label>
              {content && (
                <span className="text-xs font-medium text-zinc-400">{content.length} characters</span>
              )}
            </div>
            <textarea 
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Or paste your notes here..."
              rows={8}
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all resize-none"
            />
          </div>

          {error && (
            <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">
              {error}
            </div>
          )}

          <button 
            onClick={handleGenerate}
            disabled={isGenerating || isReadingFile}
            className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <Loader2 className="animate-spin" />
                Generating Study Materials...
              </>
            ) : (
              <>
                <Brain size={20} />
                Generate Quiz & Flashcards
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const QuizView = ({ quiz }: { quiz: StudySet['quiz'] }) => {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [showResults, setShowResults] = useState(false);

  const handleAnswer = (index: number) => {
    if (selectedOption !== null) return;
    
    setSelectedOption(index);
    if (index === quiz[currentQuestion].correctAnswer) {
      setScore(score + 1);
    }
  };

  const nextQuestion = () => {
    if (currentQuestion + 1 < quiz.length) {
      setCurrentQuestion(currentQuestion + 1);
      setSelectedOption(null);
    } else {
      setShowResults(true);
      if (score + (selectedOption === quiz[currentQuestion].correctAnswer ? 1 : 0) === quiz.length) {
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 }
        });
      }
    }
  };

  if (showResults) {
    return (
      <div className="text-center py-12">
        <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 size={40} />
        </div>
        <h3 className="text-3xl font-display font-bold mb-2">Quiz Completed!</h3>
        <p className="text-zinc-500 mb-8">You scored {score} out of {quiz.length}</p>
        <button 
          onClick={() => {
            setCurrentQuestion(0);
            setSelectedOption(null);
            setScore(0);
            setShowResults(false);
          }}
          className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all"
        >
          Try Again
        </button>
      </div>
    );
  }

  const q = quiz[currentQuestion];

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8 flex justify-between items-end">
        <div>
          <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Question {currentQuestion + 1} of {quiz.length}</span>
          <h3 className="text-2xl font-display font-bold mt-1">{q.question}</h3>
        </div>
      </div>

      <div className="space-y-3">
        {q.options.map((option, idx) => {
          const isCorrect = idx === q.correctAnswer;
          const isSelected = idx === selectedOption;
          
          let bgColor = "bg-white border-zinc-200 hover:border-indigo-300";
          if (selectedOption !== null) {
            if (isCorrect) bgColor = "bg-green-50 border-green-500 text-green-700";
            else if (isSelected) bgColor = "bg-red-50 border-red-500 text-red-700";
            else bgColor = "bg-zinc-50 border-zinc-100 opacity-50";
          }

          return (
            <button 
              key={idx}
              onClick={() => handleAnswer(idx)}
              disabled={selectedOption !== null}
              className={`w-full text-left p-5 rounded-2xl border-2 transition-all flex items-center justify-between ${bgColor}`}
            >
              <span className="font-medium">{option}</span>
              {selectedOption !== null && isCorrect && <CheckCircle2 size={20} className="text-green-500" />}
              {selectedOption !== null && isSelected && !isCorrect && <X size={20} className="text-red-500" />}
            </button>
          );
        })}
      </div>

      <div className="mt-8 flex justify-end">
        <button 
          onClick={nextQuestion}
          disabled={selectedOption === null}
          className="flex items-center gap-2 bg-zinc-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-zinc-800 transition-all disabled:opacity-50"
        >
          {currentQuestion + 1 === quiz.length ? 'Finish Quiz' : 'Next Question'}
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
};

const FlashcardView = ({ flashcards }: { flashcards: StudySet['flashcards'] }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const nextCard = () => {
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentIndex((currentIndex + 1) % flashcards.length);
    }, 150);
  };

  const prevCard = () => {
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentIndex((currentIndex - 1 + flashcards.length) % flashcards.length);
    }, 150);
  };

  return (
    <div className="max-w-xl mx-auto py-8">
      <div className="mb-8 text-center">
        <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Card {currentIndex + 1} of {flashcards.length}</span>
      </div>

      <div 
        className="relative h-80 w-full cursor-pointer perspective-1000"
        onClick={() => setIsFlipped(!isFlipped)}
      >
        <motion.div 
          className="w-full h-full relative preserve-3d transition-all duration-500"
          animate={{ rotateY: isFlipped ? 180 : 0 }}
        >
          {/* Front */}
          <div className="absolute inset-0 backface-hidden glass rounded-3xl p-12 flex items-center justify-center text-center">
            <h3 className="text-2xl font-display font-bold">{flashcards[currentIndex].front}</h3>
            <div className="absolute bottom-6 text-zinc-400 text-xs font-medium uppercase tracking-widest">Click to flip</div>
          </div>

          {/* Back */}
          <div className="absolute inset-0 backface-hidden glass rounded-3xl p-12 flex items-center justify-center text-center rotate-y-180 bg-indigo-50">
            <p className="text-xl font-medium text-indigo-900 leading-relaxed">{flashcards[currentIndex].back}</p>
            <div className="absolute bottom-6 text-indigo-400 text-xs font-medium uppercase tracking-widest">Click to flip</div>
          </div>
        </motion.div>
      </div>

      <div className="mt-12 flex items-center justify-center gap-6">
        <button 
          onClick={(e) => { e.stopPropagation(); prevCard(); }}
          className="w-12 h-12 rounded-full border border-zinc-200 flex items-center justify-center hover:bg-zinc-100 transition-all"
        >
          <ChevronRight size={24} className="rotate-180" />
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); nextCard(); }}
          className="w-12 h-12 rounded-full bg-zinc-900 text-white flex items-center justify-center hover:bg-zinc-800 transition-all"
        >
          <ChevronRight size={24} />
        </button>
      </div>
    </div>
  );
};

const StudySetDetail = ({ set, onBack }: { set: StudySet, onBack: () => void }) => {
  const [tab, setTab] = useState<'quiz' | 'flashcards' | 'notes'>('quiz');

  return (
    <div className="max-w-5xl mx-auto pt-24 pb-20 px-4">
      <button 
        onClick={onBack}
        className="mb-8 flex items-center gap-2 text-zinc-500 hover:text-zinc-900 transition-colors font-medium"
      >
        <ChevronRight size={20} className="rotate-180" />
        Back to Library
      </button>

      <div className="mb-12">
        <h1 className="text-4xl font-display font-bold mb-4">{set.title}</h1>
        <div className="flex gap-4 border-b border-zinc-200">
          <button 
            onClick={() => setTab('quiz')}
            className={`pb-4 px-2 text-sm font-bold uppercase tracking-widest transition-all border-b-2 ${tab === 'quiz' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-zinc-400 hover:text-zinc-600'}`}
          >
            Quiz
          </button>
          <button 
            onClick={() => setTab('flashcards')}
            className={`pb-4 px-2 text-sm font-bold uppercase tracking-widest transition-all border-b-2 ${tab === 'flashcards' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-zinc-400 hover:text-zinc-600'}`}
          >
            Flashcards
          </button>
          <button 
            onClick={() => setTab('notes')}
            className={`pb-4 px-2 text-sm font-bold uppercase tracking-widest transition-all border-b-2 ${tab === 'notes' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-zinc-400 hover:text-zinc-600'}`}
          >
            Original Notes
          </button>
        </div>
      </div>

      <motion.div
        key={tab}
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
      >
        {tab === 'quiz' && <QuizView quiz={set.quiz} />}
        {tab === 'flashcards' && <FlashcardView flashcards={set.flashcards} />}
        {tab === 'notes' && (
          <div className="glass rounded-3xl p-8 md:p-12 whitespace-pre-wrap text-zinc-700 leading-relaxed">
            {set.content}
          </div>
        )}
      </motion.div>
    </div>
  );
};

const ContactUs = () => {
  return (
    <div className="max-w-2xl mx-auto pt-32 pb-20 px-4">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-display font-bold mb-4">Get in Touch</h1>
        <p className="text-zinc-500">Have questions or feedback? We'd love to hear from you.</p>
      </div>

      <div className="glass rounded-3xl p-8 md:p-12">
        <form action="https://formspree.io/f/mwvrqyjy" method="POST" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-zinc-700 mb-2">Name</label>
              <input 
                type="text" 
                name="name"
                required
                className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-zinc-700 mb-2">Email</label>
              <input 
                type="email" 
                name="email"
                required
                className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-zinc-700 mb-2">Message</label>
            <textarea 
              name="message"
              required
              rows={6}
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none"
            />
          </div>
          <button 
            type="submit"
            className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
          >
            <MessageSquare size={20} />
            Send Message
          </button>
        </form>
      </div>
    </div>
  );
};

const Library = ({ sets, onSelect, onNew }: { sets: StudySet[], onSelect: (s: StudySet) => void, onNew: () => void }) => {
  return (
    <div className="max-w-7xl mx-auto pt-32 pb-20 px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between items-end mb-12">
        <div>
          <h1 className="text-4xl font-display font-bold mb-2">My Library</h1>
          <p className="text-zinc-500">Your collection of study materials.</p>
        </div>
        <button 
          onClick={onNew}
          className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
        >
          <Plus size={20} />
          New Set
        </button>
      </div>

      {sets.length === 0 ? (
        <div className="text-center py-20 glass rounded-3xl border-dashed border-2 border-zinc-200">
          <div className="w-16 h-16 bg-zinc-100 text-zinc-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <BookOpen size={32} />
          </div>
          <h3 className="text-xl font-bold mb-2">No study sets yet</h3>
          <p className="text-zinc-500 mb-8">Upload your first notes to get started.</p>
          <button 
            onClick={onNew}
            className="text-indigo-600 font-bold hover:underline"
          >
            Create your first set
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sets.map((set) => (
            <motion.div 
              key={set.id}
              whileHover={{ y: -4 }}
              onClick={() => onSelect(set)}
              className="glass p-6 rounded-3xl cursor-pointer group"
            >
              <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                <BookOpen size={24} />
              </div>
              <h3 className="text-xl font-bold mb-2 line-clamp-1">{set.title}</h3>
              <p className="text-zinc-500 text-sm line-clamp-2 mb-6">{set.content}</p>
              <div className="flex items-center justify-between pt-4 border-t border-zinc-100">
                <div className="flex gap-3">
                  <span className="flex items-center gap-1 text-xs font-bold text-zinc-400">
                    <CheckCircle2 size={14} /> {set.quiz.length} Qs
                  </span>
                  <span className="flex items-center gap-1 text-xs font-bold text-zinc-400">
                    <Layers size={14} /> {set.flashcards.length} Cards
                  </span>
                </div>
                <ChevronRight size={18} className="text-zinc-300 group-hover:text-indigo-600 transition-colors" />
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<ViewState>('home');
  const [studySets, setStudySets] = useState<StudySet[]>([]);
  const [selectedSet, setSelectedSet] = useState<StudySet | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Test connection
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();

    let unsubSets: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      
      // Cleanup previous subscription if any
      if (unsubSets) {
        unsubSets();
        unsubSets = null;
      }

      if (u) {
        // Sync user profile
        const userRef = doc(db, 'users', u.uid);
        setDoc(userRef, {
          uid: u.uid,
          email: u.email,
          displayName: u.displayName,
          photoURL: u.photoURL,
          createdAt: new Date().toISOString()
        }, { merge: true }).catch(err => {
          // Ignore permission errors during initial sync if rules haven't propagated
          if (err.code !== 'permission-denied') {
            handleFirestoreError(err, OperationType.WRITE, `users/${u.uid}`);
          }
        });

        // Listen for study sets
        const q = query(collection(db, 'studySets'), where('userId', '==', u.uid));
        unsubSets = onSnapshot(q, (snapshot) => {
          const sets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StudySet));
          setStudySets(sets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        }, (err) => {
          // Only report non-permission errors or report them gracefully
          if (err.code !== 'permission-denied') {
            handleFirestoreError(err, OperationType.LIST, 'studySets');
          }
        });
      } else {
        setStudySets([]);
      }
    });

    return () => {
      unsubscribe();
      if (unsubSets) unsubSets();
    };
  }, []);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-zinc-50">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen">
        <Navbar user={user} setView={(v) => { setView(v); setSelectedSet(null); }} activeView={view} />
        
        <main>
          {!user ? (
            <div className="pt-32 pb-20 px-4 text-center max-w-4xl mx-auto">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mb-12"
              >
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-full text-sm font-bold mb-6">
                  <Brain size={16} />
                  <span>AI-Powered Learning</span>
                </div>
                <h1 className="text-6xl md:text-7xl font-display font-bold tracking-tight mb-6 leading-[1.1]">
                  Snap your notes. <span className="text-indigo-600">Become a savant.</span>
                </h1>
                <p className="text-xl text-zinc-500 mb-10 max-w-2xl mx-auto leading-relaxed">
                  Upload photos of your notes and let StudySavant transform them into interactive quizzes and flashcards instantly.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <button 
                    onClick={signIn}
                    className="w-full sm:w-auto bg-zinc-900 text-white px-10 py-4 rounded-2xl font-bold text-lg hover:bg-zinc-800 transition-all shadow-xl shadow-zinc-200"
                  >
                    Get Started for Free
                  </button>
                  <button 
                    onClick={() => setView('contact')}
                    className="w-full sm:w-auto bg-white text-zinc-900 border border-zinc-200 px-10 py-4 rounded-2xl font-bold text-lg hover:bg-zinc-50 transition-all"
                  >
                    Contact Us
                  </button>
                </div>
              </motion.div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-24">
                {[
                  { icon: <Plus />, title: "Upload Notes", desc: "Paste your text or notes directly into the app." },
                  { icon: <Brain />, title: "AI Generation", desc: "Our AI analyzes your content to create relevant questions." },
                  { icon: <Layers />, title: "Study & Master", desc: "Use interactive quizzes and flashcards to test your knowledge." }
                ].map((feature, i) => (
                  <div key={i} className="glass p-8 rounded-3xl text-left">
                    <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center mb-6">
                      {feature.icon}
                    </div>
                    <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                    <p className="text-zinc-500 text-sm leading-relaxed">{feature.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {view === 'home' && !selectedSet && (
                <motion.div key="library" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <Library 
                    sets={studySets} 
                    onSelect={(s) => setSelectedSet(s)} 
                    onNew={() => setView('upload')} 
                  />
                </motion.div>
              )}
              
              {view === 'upload' && (
                <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <NoteUpload onComplete={(s) => { setSelectedSet(s); setView('home'); }} />
                </motion.div>
              )}

              {selectedSet && (
                <motion.div key="detail" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <StudySetDetail set={selectedSet} onBack={() => setSelectedSet(null)} />
                </motion.div>
              )}

              {view === 'contact' && (
                <motion.div key="contact" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <ContactUs />
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </main>

        <footer className="border-t border-zinc-200 py-12 bg-white">
          <div className="max-w-7xl mx-auto px-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="w-8 h-8 bg-zinc-900 rounded-lg flex items-center justify-center text-white">
                <Brain size={18} />
              </div>
              <span className="text-lg font-display font-bold tracking-tight">StudySavant</span>
            </div>
            <p className="text-zinc-400 text-sm">© 2026 StudySavant. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </ErrorBoundary>
  );
}
