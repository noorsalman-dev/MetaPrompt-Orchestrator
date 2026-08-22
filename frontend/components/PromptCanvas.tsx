'use client';

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import ReactFlow, {
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Handle,
  Position,
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  Connection,
  NodeProps,
  Panel,
  NodeResizer
} from 'reactflow';
import 'reactflow/dist/style.css';

type SystemNodeData = {
  title?: string;
  prompt: string;
  nodeNumber: number | string;
  onChange?: (val: string) => void;
  onTitleChange?: (val: string) => void;
  onDelete?: () => void;
};

type Message = {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
};

type Project = {
  id: string;
  name: string;
};

const STORAGE_KEYS = {
  PROJECTS: 'meta_prompt_projects_v1',
  ACTIVE_PROJECT: 'meta_prompt_active_project_v1',
  NODES: (pId: string) => `meta_prompt_nodes_${pId}`,
  EDGES: (pId: string) => `meta_prompt_edges_${pId}`,
  CHAT: (pId: string) => `meta_prompt_chat_${pId}`
};

const DEFAULT_PROJECTS: Project[] = [
  { id: 'proj-1', name: 'API Pipeline Project' },
  { id: 'proj-2', name: 'Content Generator' }
];

const DEFAULT_NODES: Node<SystemNodeData>[] = [
  {
    id: '1',
    type: 'systemNode',
    position: { x: 100, y: 150 },
    style: { width: 300, height: 220 },
    data: { nodeNumber: 1, title: 'API Assistant', prompt: 'You are an API assistant. Extract name and score in JSON format.' }
  },
  {
    id: '2',
    type: 'systemNode',
    position: { x: 500, y: 150 },
    style: { width: 300, height: 220 },
    data: { nodeNumber: 2, title: 'Output Target', prompt: 'Target node for connecting pipeline output.' }
  }
];

const DEFAULT_MESSAGES: Message[] = [
  {
    id: '1',
    sender: 'assistant',
    text: 'Hello! Select a project from the sidebar, click any node to customize it, or chat with Gemini below!'
  }
];

const SystemNode: React.FC<NodeProps<SystemNodeData>> = ({ id, data, selected }) => {
  return (
    <div
      className={`bg-slate-900 border-2 ${
        selected
          ? 'border-amber-400 ring-4 ring-amber-500/30 shadow-amber-500/20'
          : 'border-indigo-500 hover:border-indigo-400'
      } rounded-lg p-4 w-full h-full text-white shadow-xl relative transition-all duration-200 cursor-pointer flex flex-col min-w-[220px] min-h-[160px]`}
    >
      <NodeResizer
        color={selected ? '#f59e0b' : '#6366f1'}
        isVisible={selected}
        minWidth={220}
        minHeight={160}
      />

      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-indigo-500" />

      <div className="flex items-center justify-between mb-2 gap-2 shrink-0">
        <input
          type="text"
          className={`text-xs font-bold uppercase tracking-wider bg-transparent border-b border-transparent hover:border-slate-700 focus:border-indigo-500 focus:outline-none w-full truncate ${
            selected ? 'text-amber-400' : 'text-indigo-400'
          }`}
          value={data.title ?? `Node #${data.nodeNumber || id}`}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => data.onTitleChange?.(e.target.value)}
          placeholder="Node Title..."
        />

        <div className="flex items-center gap-1 shrink-0">
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
              selected
                ? 'bg-amber-950 text-amber-300 border-amber-800'
                : 'bg-indigo-950 text-indigo-300 border-indigo-800'
            }`}
          >
            {selected ? 'ACTIVE' : `Node #${data.nodeNumber || id}`}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              data.onDelete?.();
            }}
            className="text-[10px] px-1.5 py-0.5 bg-red-950 hover:bg-red-900 text-red-300 rounded border border-red-800 transition-all"
            title="Delete Node"
          >
            🗑️
          </button>
        </div>
      </div>

      <textarea
        className="w-full bg-slate-950 text-slate-200 text-xs p-2 rounded border border-slate-800 focus:outline-none focus:border-indigo-500 resize-none flex-1 min-h-[80px]"
        value={data.prompt}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => data.onChange?.(e.target.value)}
        placeholder="Type content or instruction..."
      />

      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-indigo-500" />
    </div>
  );
};

export default function PromptCanvas() {
  const nodeTypes = useMemo(() => ({ systemNode: SystemNode }), []);

  const [projects, setProjects] = useState<Project[]>(DEFAULT_PROJECTS);
  const [activeProjectId, setActiveProjectId] = useState<string>('proj-1');

  const [nodes, setNodes] = useState<Node<SystemNodeData>[]>(DEFAULT_NODES);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [messages, setMessages] = useState<Message[]>(DEFAULT_MESSAGES);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('1');

  const [isChatLoading, setIsChatLoading] = useState<boolean>(false);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isProjectsOpen, setIsProjectsOpen] = useState<boolean>(true);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const cachedModelsRef = useRef<string[] | null>(null);

  useEffect(() => {
    try {
      const savedProjects = localStorage.getItem(STORAGE_KEYS.PROJECTS);
      const savedActive = localStorage.getItem(STORAGE_KEYS.ACTIVE_PROJECT);
      if (savedProjects) setProjects(JSON.parse(savedProjects));
      if (savedActive) setActiveProjectId(savedActive);
    } catch (e) {
      console.error('Error loading project index:', e);
    }
  }, []);

  useEffect(() => {
    if (!activeProjectId) return;
    try {
      const savedNodes = localStorage.getItem(STORAGE_KEYS.NODES(activeProjectId));
      const savedEdges = localStorage.getItem(STORAGE_KEYS.EDGES(activeProjectId));
      const savedChat = localStorage.getItem(STORAGE_KEYS.CHAT(activeProjectId));

      setNodes(savedNodes ? JSON.parse(savedNodes) : DEFAULT_NODES);
      setEdges(savedEdges ? JSON.parse(savedEdges) : []);
      setMessages(savedChat ? JSON.parse(savedChat) : DEFAULT_MESSAGES);
      setSelectedNodeId('1');
    } catch (e) {
      console.error('Error loading project data:', e);
    } finally {
      setIsLoaded(true);
    }
  }, [activeProjectId]);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
      localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT, activeProjectId);
    }
  }, [projects, activeProjectId, isLoaded]);

  useEffect(() => {
    if (isLoaded) localStorage.setItem(STORAGE_KEYS.NODES(activeProjectId), JSON.stringify(nodes));
  }, [nodes, activeProjectId, isLoaded]);

  useEffect(() => {
    if (isLoaded) localStorage.setItem(STORAGE_KEYS.EDGES(activeProjectId), JSON.stringify(edges));
  }, [edges, activeProjectId, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(STORAGE_KEYS.CHAT(activeProjectId), JSON.stringify(messages));
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeProjectId, isLoaded]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds) as Node<SystemNodeData>[]),
    []
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect = useCallback((params: Connection) => setEdges((eds) => addEdge(params, eds)), []);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const createNewProject = () => {
    const projName = prompt('Enter new project name:');
    if (!projName || !projName.trim()) return;

    const newId = `proj-${Date.now()}`;
    const newProj: Project = { id: newId, name: projName.trim() };

    setProjects((prev) => [...prev, newProj]);
    setActiveProjectId(newId);
  };

  const renameProject = (projId: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newName = prompt('Enter new project name:', currentName);
    if (!newName || !newName.trim()) return;

    setProjects((prev) =>
      prev.map((p) => (p.id === projId ? { ...p, name: newName.trim() } : p))
    );
  };

  const removeProject = (projId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (projects.length <= 1) {
      alert('You cannot delete the last remaining project.');
      return;
    }
    if (!confirm('Are you sure you want to delete this project? All associated nodes and chat history will be removed.')) {
      return;
    }

    localStorage.removeItem(STORAGE_KEYS.NODES(projId));
    localStorage.removeItem(STORAGE_KEYS.EDGES(projId));
    localStorage.removeItem(STORAGE_KEYS.CHAT(projId));

    const updatedProjects = projects.filter((p) => p.id !== projId);
    setProjects(updatedProjects);

    if (activeProjectId === projId) {
      setActiveProjectId(updatedProjects[0].id);
    }
  };

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      if (selectedNodeId === nodeId) {
        setSelectedNodeId(null);
      }
    },
    [selectedNodeId]
  );

  const createNewNode = useCallback((initialPrompt: string = '', initialTitle?: string) => {
    setNodes((nds) => {
      const nextNum = nds.length + 1;
      const id = `${Date.now()}`;
      const newNode: Node<SystemNodeData> = {
        id,
        type: 'systemNode',
        position: { x: 100 + (nds.length % 3) * 260, y: 150 + Math.floor(nds.length / 3) * 180 },
        style: { width: 300, height: 220 },
        data: { nodeNumber: nextNum, title: initialTitle || `Node #${nextNum}`, prompt: initialPrompt }
      };
      setSelectedNodeId(id);
      return [...nds, newNode];
    });
  }, []);

  const pushToActiveNode = useCallback(
    (text: string) => {
      const targetId = selectedNodeId || nodes[0]?.id;
      if (!targetId) {
        createNewNode(text);
        return;
      }

      setNodes((nds) =>
        nds.map((n) => (n.id === targetId ? { ...n, data: { ...n.data, prompt: text } } : n))
      );
    },
    [selectedNodeId, nodes, createNewNode]
  );

  const fetchAvailableModels = async (apiKey: string): Promise<string[]> => {
    if (cachedModelsRef.current && cachedModelsRef.current.length > 0) {
      return cachedModelsRef.current;
    }

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      const data = await res.json();

      if (data.models && Array.isArray(data.models)) {
        const nonTextKeywords = ['tts', 'embed', 'imagen', 'audio', 'realtime', 'bison', 'gecko'];

        const validModels = data.models
          .filter((m: any) => {
            const name = m.name.toLowerCase();
            const supportsContent = m.supportedGenerationMethods?.includes('generateContent');
            const isNonText = nonTextKeywords.some((kw) => name.includes(kw));
            return supportsContent && !isNonText;
          })
          .map((m: any) => m.name.replace('models/', ''));

        validModels.sort((a: string, b: string) => {
          if (a.includes('flash') && !b.includes('flash')) return -1;
          if (!a.includes('flash') && b.includes('flash')) return 1;
          return 0;
        });

        if (validModels.length > 0) {
          cachedModelsRef.current = validModels;
          return validModels;
        }
      }
    } catch (e) {
      console.warn('Fallback to standard model list.', e);
    }

    return ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash'];
  };

  const fetchGeminiReply = async (userText: string): Promise<string> => {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

    if (!apiKey || apiKey.trim() === '' || apiKey.includes('your_actual')) {
      return `⚠️ Missing API Key! Ensure NEXT_PUBLIC_GEMINI_API_KEY is defined in frontend/.env.local and restart server.`;
    }

    const modelsToTry = await fetchAvailableModels(apiKey);
    let lastError = '';

    for (const model of modelsToTry) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: userText }] }] })
          }
        );

        const data = await response.json();

        if (data.error) {
          lastError = `❌ Gemini API Error (${data.error.code}): ${data.error.message}`;
          if ([400, 429, 404, 503].includes(data.error.code) || data.error.code >= 500) {
            continue;
          }
          return lastError;
        }

        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (reply) return reply;
      } catch (err: any) {
        lastError = `❌ Network Error: ${err.message || 'Failed to connect.'}`;
      }
    }

    return lastError || 'No response text returned from valid Gemini models.';
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputMessage.trim() || isChatLoading) return;

    const userText = inputMessage;
    const userMsg: Message = { id: Date.now().toString(), sender: 'user', text: userText };
    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setIsChatLoading(true);

    try {
      const lowerText = userText.toLowerCase();

      if (lowerText.includes('add node') || lowerText.includes('new node') || lowerText.includes('create node')) {
        const aiText = await fetchGeminiReply(
          `Write a concise system prompt instruction or content based on this request: "${userText}". Return ONLY the response text.`
        );

        if (aiText.startsWith('⚠️') || aiText.startsWith('❌')) {
          setMessages((prev) => [...prev, { id: Date.now().toString(), sender: 'assistant', text: aiText }]);
        } else {
          createNewNode(aiText);
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              sender: 'assistant',
              text: `✨ Created & selected new node with prompt:\n\n"${aiText}"`
            }
          ]);
        }
      } else {
        const reply = await fetchGeminiReply(userText);
        setMessages((prev) => [...prev, { id: Date.now().toString(), sender: 'assistant', text: reply }]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), sender: 'assistant', text: `❌ Chat error: ${err.message || 'Failed processing.'}` }
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const activeTargetNode = useMemo(() => {
    return nodes.find((n) => n.id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  const renderedNodes = useMemo(() => {
    return nodes.map((n, index) => ({
      ...n,
      selected: n.id === selectedNodeId,
      data: {
        ...n.data,
        nodeNumber: n.data.nodeNumber || index + 1,
        onChange: (val: string) => {
          setNodes((nds) =>
            nds.map((node) => (node.id === n.id ? { ...node, data: { ...node.data, prompt: val } } : node))
          );
        },
        onTitleChange: (val: string) => {
          setNodes((nds) =>
            nds.map((node) => (node.id === n.id ? { ...node, data: { ...node.data, title: val } } : node))
          );
        },
        onDelete: () => deleteNode(n.id)
      }
    }));
  }, [nodes, selectedNodeId, deleteNode]);

  return (
    <div className="flex h-screen w-full bg-slate-950 font-sans overflow-hidden">
      {/* Main Flow Canvas */}
      <div className="flex-1 h-full relative">
        <ReactFlow
          nodes={renderedNodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
        >
          <Background color="#334155" gap={16} />
          <Controls />
          <Panel position="top-left" className="flex gap-2">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs py-2 px-3 rounded shadow-lg transition-all border border-slate-700 flex items-center gap-1.5"
            >
              <span>{isSidebarOpen ? '◀' : '▶'}</span> {isSidebarOpen ? 'Hide Sidebar' : 'Show Sidebar'}
            </button>
            <button
              onClick={() => createNewNode('')}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs py-2 px-4 rounded shadow-lg transition-all border border-indigo-400"
            >
              + Add Node
            </button>
          </Panel>
        </ReactFlow>
      </div>

      {/* Projects & Chat Sidebar (Collapsible) */}
      <div
        className={`border-l border-slate-800 bg-slate-900 flex flex-col justify-between h-full transition-all duration-300 overflow-hidden ${
          isSidebarOpen ? 'w-80 min-w-[20rem]' : 'w-0 min-w-0 border-l-0'
        }`}
      >
        <div className="border-b border-slate-800 bg-slate-950 w-80">
          <div className="p-3 flex items-center justify-between">
            <h2 
              onClick={() => setIsProjectsOpen(!isProjectsOpen)}
              className="text-sm font-bold text-white flex items-center gap-2 cursor-pointer select-none"
            >
              <span>📁</span> Projects / Workspaces
              <span className="text-xs text-slate-400">{isProjectsOpen ? '▼' : '▶'}</span>
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsProjectsOpen(!isProjectsOpen)}
                className="text-slate-400 hover:text-white text-xs px-2 py-0.5 rounded bg-slate-900 border border-slate-800"
                title={isProjectsOpen ? "Collapse project names" : "Expand project names"}
              >
                {isProjectsOpen ? '▲' : '▼'}
              </button>
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="text-slate-400 hover:text-white text-xs px-2 py-0.5 rounded bg-slate-900 border border-slate-800"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Project Switcher List (Collapsible with Rename & Remove actions) */}
          {isProjectsOpen && (
            <div className="px-3 pb-3">
              <div className="space-y-1 max-h-36 overflow-y-auto mb-2 pr-1">
                {projects.map((proj) => (
                  <div
                    key={proj.id}
                    onClick={() => setActiveProjectId(proj.id)}
                    className={`w-full text-xs px-2.5 py-1.5 rounded transition-all truncate flex items-center justify-between cursor-pointer group ${
                      proj.id === activeProjectId
                        ? 'bg-indigo-600 text-white font-bold shadow'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-300'
                    }`}
                  >
                    <span className="truncate flex-1">📂 {proj.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {proj.id === activeProjectId && (
                        <span className="text-[10px] bg-indigo-900 px-1.5 py-0.5 rounded">Active</span>
                      )}
                      <button
                        onClick={(e) => renameProject(proj.id, proj.name, e)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded"
                        title="Rename project"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={(e) => removeProject(proj.id, e)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] px-1.5 py-0.5 bg-red-950 hover:bg-red-900 text-red-300 rounded"
                        title="Delete project"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={createNewProject}
                className="w-full bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-semibold py-1.5 px-3 rounded border border-slate-700 transition-all text-center flex items-center justify-center gap-1"
              >
                <span>+</span> Create New Project
              </button>
            </div>
          )}
        </div>

        {/* Gemini Chat Header */}
        <div className="p-3 border-b border-slate-800 bg-slate-950 w-80">
          <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
            <span>✨</span> Gemini Chat
          </h2>
          <div className="flex items-center justify-between bg-slate-900 p-1.5 rounded border border-slate-800 text-xs mb-2">
            <span className="text-slate-400">Target:</span>
            <select
              value={activeTargetNode?.id || ''}
              onChange={(e) => setSelectedNodeId(e.target.value || null)}
              className="bg-slate-950 text-amber-400 font-bold border border-slate-700 rounded px-1.5 py-0.5 focus:outline-none max-w-[140px] truncate"
            >
              <option value="">(None)</option>
              {nodes.map((n, idx) => (
                <option key={n.id} value={n.id}>
                  {n.data.title || `Node #${n.data.nodeNumber || idx + 1}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Message Stream */}
        <div className="flex-1 p-3 overflow-y-auto space-y-3 text-xs w-80">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
              <div
                className={`max-w-[90%] p-2.5 rounded-lg whitespace-pre-wrap ${
                  msg.sender === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-none'
                    : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-none'
                }`}
              >
                {msg.text}

                {msg.sender === 'assistant' && !msg.text.startsWith('⚠️') && !msg.text.startsWith('❌') && (
                  <div className="flex gap-2 mt-2 pt-2 border-t border-slate-700/60">
                    <button
                      onClick={() => createNewNode(msg.text)}
                      className="text-[10px] font-semibold bg-indigo-950 hover:bg-indigo-900 text-indigo-300 px-2 py-0.5 rounded border border-indigo-700 transition-all"
                    >
                      ➕ Node
                    </button>
                    <button
                      onClick={() => pushToActiveNode(msg.text)}
                      className="text-[10px] font-semibold bg-amber-950 hover:bg-amber-900 text-amber-300 px-2 py-0.5 rounded border border-amber-700 transition-all truncate max-w-[120px]"
                    >
                      ↙ Active
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {isChatLoading && (
            <div className="flex justify-start">
              <div className="bg-slate-800 text-slate-400 p-2.5 rounded-lg border border-slate-700 text-xs italic">
                Gemini is thinking...
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-800 bg-slate-950 flex gap-2 w-80">
          <input
            type="text"
            className="flex-1 bg-slate-900 text-white text-xs p-2 rounded border border-slate-800 focus:outline-none focus:border-indigo-500"
            placeholder="Ask Gemini or type commands..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            disabled={isChatLoading}
          />
          <button
            type="submit"
            disabled={isChatLoading}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-2 rounded transition-all disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}