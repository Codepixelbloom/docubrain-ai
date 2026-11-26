'use client';

import React, { useState } from 'react';
import axios from 'axios';
import { Upload, Search, FileText, Download } from 'lucide-react';

interface MatchedFile {
  id: string;
  name: string;
  relevanceSnippet: string;
}

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [query, setQuery] = useState<string>('');
  const [answer, setAnswer] = useState<string>('');
  const [matchedFiles, setMatchedFiles] = useState<MatchedFile[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const handleFileUpload = async () => {
    if (!file) return;
    setUploadStatus('Uploading and indexing...');
    const formData = new FormData();
    formData.append('file', file);

    try {
      await axios.post(`${API_URL}/api/upload`, formData);
      setUploadStatus('File successfully uploaded and indexed!');
    } catch (error) {
      setUploadStatus('Upload failed. Ensure backend server is running.');
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query) return;
    setLoading(true);

    try {
      const res = await axios.post(`${API_URL}/api/search`, { query });
      setAnswer(res.data.answer);
      setMatchedFiles(res.data.matched_files);
    } catch (error) {
      setAnswer('Failed to search documents.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* File Upload Section */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Upload className="w-5 h-5 text-blue-600" /> Upload Document
        </h2>
        <input 
          type="file" 
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
        <button
          onClick={handleFileUpload}
          className="bg-blue-600 text-white py-2 px-4 rounded-md font-medium hover:bg-blue-700 transition"
        >
          Process & Index File
        </button>
        {uploadStatus && <p className="text-sm text-gray-600">{uploadStatus}</p>}
      </div>

      {/* AI Chat Search Section */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Search className="w-5 h-5 text-blue-600" /> AI Document Search
        </h2>
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            placeholder="Ask about your documents..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="bg-gray-900 text-white px-4 py-2 rounded-md text-sm hover:bg-gray-800 transition"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>

        {answer && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-800 font-medium">{answer}</p>
            <div className="mt-3 flex flex-col gap-2">
              {matchedFiles.map((f) => (
                <div key={f.id} className="p-3 bg-white border rounded-md flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold flex items-center gap-1">
                      <FileText className="w-4 h-4 text-blue-500" /> {f.name}
                    </p>
                    <p className="text-xs text-gray-500">{f.relevanceSnippet}</p>
                  </div>
                  <a
                    href={`${API_URL}/api/download/${f.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 hover:bg-gray-100 rounded"
                  >
                    <Download className="w-4 h-4 text-gray-600" />
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}