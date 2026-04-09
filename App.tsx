/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp, 
  orderBy,
  Timestamp
} from 'firebase/firestore';
import { 
  Plus, 
  Copy, 
  Download, 
  Trash2, 
  Search, 
  LogOut, 
  LogIn,
  Edit2,
  Check,
  X,
  ExternalLink,
  Table as TableIcon,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { auth, db, googleProvider, signInWithPopup, signOut, onAuthStateChanged } from './firebase';
import { cn, formatTimestamp } from './lib/utils';

// Types
interface LinkEntry {
  id: string;
  workName: string;
  url: string;
  timestamp: Timestamp;
  updatedAt?: Timestamp;
  userId: string;
}

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
    providerInfo: any[];
  }
}

export default function App() {
  const [user, setUser] = useState(auth.currentUser);
  const [links, setLinks] = useState<LinkEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isAdding, setIsAdding] = useState(false);
  const [newWorkName, setNewWorkName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Helper: Check if two dates are the same day
  const isSameDay = (d1: Date, d2: Date) => {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  };

  // Helper: Get range of dates centered around selectedDate
  const dateRange = useMemo(() => {
    const dates = [];
    for (let i = -3; i <= 3; i++) {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() + i);
      dates.push(d);
    }
    return dates;
  }, [selectedDate]);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (!user) {
        setLinks([]);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Firestore Error Handler
  const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
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
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    // In a real app, we'd show a toast here
  };

  // Real-time Sync
  useEffect(() => {
    if (!user) return;

    const path = `users/${user.uid}/links`;
    const q = query(collection(db, path), orderBy('timestamp', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const entries: LinkEntry[] = [];
      snapshot.forEach((doc) => {
        entries.push({ id: doc.id, ...doc.data() } as LinkEntry);
      });
      setLinks(entries);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Filtered Links
  const filteredLinks = useMemo(() => {
    return links.filter(link => {
      const matchesSearch = link.workName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           link.url.toLowerCase().includes(searchQuery.toLowerCase());
      
      const linkDate = link.timestamp?.toDate();
      const matchesDate = linkDate ? isSameDay(linkDate, selectedDate) : true;
      
      return matchesSearch && matchesDate;
    });
  }, [links, searchQuery, selectedDate]);

  // Actions
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Login Error:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout Error:', error);
    }
  };

  const handleAddRow = async () => {
    if (!user || !newWorkName || !newUrl) return;

    const path = `users/${user.uid}/links`;
    try {
      await addDoc(collection(db, path), {
        workName: newWorkName,
        url: newUrl,
        timestamp: serverTimestamp(),
        userId: user.uid
      });
      setNewWorkName('');
      setNewUrl('');
      setIsAdding(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    const path = `users/${user.uid}/links/${id}`;
    try {
      await deleteDoc(doc(db, path));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const handleUpdate = async (id: string, updatedData: Partial<LinkEntry>) => {
    if (!user) return;
    const path = `users/${user.uid}/links/${id}`;
    try {
      await updateDoc(doc(db, path), {
        ...updatedData,
        updatedAt: serverTimestamp()
      });
      setEditingId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Show toast?
  };

  const handleCopyAll = () => {
    const allLinks = links.map(l => l.url).join('\n');
    copyToClipboard(allLinks);
  };

  const handleCopySelected = () => {
    const selectedLinks = links
      .filter(l => selectedIds.has(l.id))
      .map(l => l.url)
      .join('\n');
    copyToClipboard(selectedLinks);
  };

  const handleExport = (format: 'xlsx' | 'csv') => {
    const data = filteredLinks.map(l => ({
      'Work Name': l.workName,
      'Link': l.url,
      'Time': l.timestamp ? formatTimestamp(l.timestamp.toDate()) : 'Pending...'
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Links');

    if (format === 'xlsx') {
      XLSX.writeFile(wb, 'productivity_links.xlsx');
    } else {
      XLSX.writeFile(wb, 'productivity_links.csv', { bookType: 'csv' });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg">
              <TableIcon className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight hidden sm:block">LinkSync</h1>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <>
                <div className="hidden md:flex items-center gap-2 mr-4">
                  <img 
                    src={user.photoURL || ''} 
                    alt={user.displayName || ''} 
                    className="w-8 h-8 rounded-full border border-gray-200"
                    referrerPolicy="no-referrer"
                  />
                  <span className="text-sm font-medium text-gray-600">{user.displayName}</span>
                </div>
                <button 
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:text-red-600 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </>
            ) : (
              <button 
                onClick={handleLogin}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
              >
                <LogIn className="w-4 h-4" />
                <span>Login with Google</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {!user ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="bg-blue-50 p-6 rounded-full mb-6">
              <TableIcon className="w-12 h-12 text-blue-600" />
            </div>
            <h2 className="text-3xl font-bold mb-4">Welcome to LinkSync</h2>
            <p className="text-gray-600 max-w-md mb-8">
              The ultimate productivity tool to manage your links across all devices. 
              Login to start syncing your work in real-time.
            </p>
            <button 
              onClick={handleLogin}
              className="px-8 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-all shadow-lg hover:shadow-xl"
            >
              Get Started
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Calendar Navigation */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5 text-blue-600" />
                  <h3 className="font-bold text-gray-900">
                    {selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </h3>
                </div>
                <button 
                  onClick={() => setSelectedDate(new Date())}
                  className="text-xs font-medium text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                >
                  Today
                </button>
              </div>
              
              <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
                <button 
                  onClick={() => {
                    const d = new Date(selectedDate);
                    d.setDate(d.getDate() - 1);
                    setSelectedDate(d);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-full flex-shrink-0"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                
                <div className="flex gap-2 flex-1 justify-around min-w-max">
                  {dateRange.map((date, i) => {
                    const isSelected = isSameDay(date, selectedDate);
                    const isToday = isSameDay(date, new Date());
                    
                    return (
                      <button
                        key={i}
                        onClick={() => setSelectedDate(date)}
                        className={cn(
                          "flex flex-col items-center p-3 rounded-xl min-w-[64px] transition-all",
                          isSelected ? "bg-blue-600 text-white shadow-md scale-105" : "hover:bg-gray-50 text-gray-600",
                          isToday && !isSelected && "border border-blue-200"
                        )}
                      >
                        <span className="text-[10px] uppercase font-bold opacity-70">
                          {date.toLocaleDateString('en-US', { weekday: 'short' })}
                        </span>
                        <span className="text-lg font-bold">
                          {date.getDate()}
                        </span>
                      </button>
                    );
                  })}
                  
                  {/* Custom Date Picker Input */}
                  <div className="relative flex items-center px-2">
                    <input 
                      type="date" 
                      onChange={(e) => setSelectedDate(new Date(e.target.value))}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    <div className="p-3 rounded-xl border border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-400 transition-all">
                      <CalendarIcon className="w-5 h-5" />
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => {
                    const d = new Date(selectedDate);
                    d.setDate(d.getDate() + 1);
                    setSelectedDate(d);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-full flex-shrink-0"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex flex-wrap gap-2 w-full lg:w-auto">
                <button 
                  onClick={() => setIsAdding(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Row</span>
                </button>
                <button 
                  onClick={handleCopySelected}
                  disabled={selectedIds.size === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  <span>Copy Selected</span>
                </button>
                <button 
                  onClick={handleCopyAll}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  <span>Copy All Links</span>
                </button>
                <div className="relative group">
                  <button className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                    <Download className="w-4 h-4" />
                    <span>Export</span>
                  </button>
                  <div className="absolute top-full left-0 mt-1 hidden group-hover:block bg-white border border-gray-200 rounded-lg shadow-xl z-20 min-w-[120px]">
                    <button onClick={() => handleExport('xlsx')} className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm">Excel (.xlsx)</button>
                    <button onClick={() => handleExport('csv')} className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm border-t border-gray-100">CSV</button>
                  </div>
                </div>
              </div>

              <div className="relative w-full lg:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Search links..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Add Row Modal/Form */}
            <AnimatePresence>
              {isAdding && (
                <motion.div 
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="bg-white p-6 rounded-xl border border-blue-200 shadow-md"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Work Name</label>
                      <input 
                        type="text" 
                        value={newWorkName}
                        onChange={(e) => setNewWorkName(e.target.value)}
                        placeholder="e.g. Project Research"
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">URL Link</label>
                      <input 
                        type="url" 
                        value={newUrl}
                        onChange={(e) => setNewUrl(e.target.value)}
                        placeholder="https://example.com"
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button 
                      onClick={() => setIsAdding(false)}
                      className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleAddRow}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                    >
                      Save Entry
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Table */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="p-4 w-10">
                        <input 
                          type="checkbox" 
                          checked={selectedIds.size === filteredLinks.length && filteredLinks.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds(new Set(filteredLinks.map(l => l.id)));
                            } else {
                              setSelectedIds(new Set());
                            }
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </th>
                      <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Work Name</th>
                      <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Link</th>
                      <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Time</th>
                      <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    <AnimatePresence mode="popLayout">
                      {filteredLinks.map((link) => (
                        <motion.tr 
                          key={link.id}
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className={cn(
                            "hover:bg-blue-50/30 transition-colors group",
                            selectedIds.has(link.id) && "bg-blue-50/50"
                          )}
                        >
                          <td className="p-4">
                            <input 
                              type="checkbox" 
                              checked={selectedIds.has(link.id)}
                              onChange={() => toggleSelect(link.id)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                          <td className="p-4">
                            {editingId === link.id ? (
                              <input 
                                type="text" 
                                defaultValue={link.workName}
                                onBlur={(e) => handleUpdate(link.id, { workName: e.target.value })}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleUpdate(link.id, { workName: e.currentTarget.value });
                                  if (e.key === 'Escape') setEditingId(null);
                                }}
                                autoFocus
                                className="w-full px-2 py-1 border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                              />
                            ) : (
                              <span className="font-medium text-gray-900">{link.workName}</span>
                            )}
                          </td>
                          <td className="p-4">
                            {editingId === link.id ? (
                              <input 
                                type="url" 
                                defaultValue={link.url}
                                onBlur={(e) => handleUpdate(link.id, { url: e.target.value })}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleUpdate(link.id, { url: e.currentTarget.value });
                                  if (e.key === 'Escape') setEditingId(null);
                                }}
                                className="w-full px-2 py-1 border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                              />
                            ) : (
                              <div className="flex items-center gap-2">
                                <a 
                                  href={link.url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline truncate max-w-[200px] md:max-w-md"
                                >
                                  {link.url}
                                </a>
                                <button 
                                  onClick={() => copyToClipboard(link.url)}
                                  className="p-1 text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-all"
                                  title="Copy Link"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="p-4 text-sm text-gray-500 font-mono">
                            {link.timestamp ? formatTimestamp(link.timestamp.toDate()) : '...'}
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button 
                                onClick={() => setEditingId(link.id)}
                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                title="Edit"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleDelete(link.id)}
                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                    {filteredLinks.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-12 text-center text-gray-500">
                          <div className="flex flex-col items-center gap-2">
                            <CalendarIcon className="w-8 h-8 text-gray-300" />
                            <p>No entries for {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.</p>
                            <button 
                              onClick={() => setIsAdding(true)}
                              className="text-blue-600 font-medium hover:underline mt-2"
                            >
                              Add a link for this date
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 py-8 border-t border-gray-200 mt-auto">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-gray-500">© 2026 LinkSync Productivity. All data synced in real-time.</p>
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-2 text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">
              <div className="w-1.5 h-1.5 bg-green-600 rounded-full animate-pulse" />
              Cloud Synced
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
