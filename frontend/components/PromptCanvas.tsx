'use client';

import React, { useState, useCallback, useMemo } from 'react';
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
  NodeProps
} from 'reactflow';
import 'reactflow/dist/style.css';

type SystemNodeData = {
  prompt: string;
  isOptimizing?: boolean;
  onChange: (val: string) => void;
  onOptimize: () => void;
};

const SystemNode: React.FC<NodeProps<SystemNodeData>> = ({ data }) => {
  return (
    <div className="bg-slate-900 border-2 border-indigo-500 rounded-lg p-4 w-72 text-white shadow-xl">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">System Instruction</span>
        <span className="text-[10px] bg-indigo-950 text-indigo-300 px-2 py-0.5 rounded border border-indigo-800">Prompt Node</span>
      </div>
      <textarea
        className="w-full bg-slate-950 text-slate-200 text-xs p-2 rounded border border-slate-800 focus:outline-none focus:border-indigo-500 resize-none h-24"
        value={data.prompt}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => data.onChange(e.target.value)}
        placeholder="Enter raw prompt instruction..."
      />
      <button
        onClick={data.onOptimize}
        disabled={data.isOptimizing}
        className="mt-2 w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold py-1.5 px-3 rounded transition-all disabled:opacity-50"
      >
        {data.isOptimizing ? '⚡ Auto-Tuning via Gemini...' : '🚀 Auto-Tune Pipeline'}
      </button>
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-indigo-500" />
    </div>
  );
};

export default function PromptCanvas() {
  const nodeTypes = useMemo(() => ({ systemNode: SystemNode }), []);

  const [nodes, setNodes] = useState<Node<SystemNodeData>[]>([
    {
      id: '1',
      type: 'systemNode',
      position: { x: 100, y: 150 },
      data: {
        prompt: 'You are an API assistant. Extract name and score in JSON format.',
        onChange: () => {},
        onOptimize: () => {}
      }
    }
  ]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
  const [output, setOutput] = useState<Record<string, any> | null>(null);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds) as Node<SystemNodeData>[]),
    []
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    []
  );

  const handleOptimize = async () => {
    setIsOptimizing(true);
    try {
      const response = await fetch('http://localhost:8000/api/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: nodes[0].data.prompt,
          user_input: 'User: John Doe scored 98 on math test.',
          target_schema: { name: 'string', score: 'number' },
          max_iterations: 3,
          benchmark_threshold: 90.0
        })
      });
      const data = await response.json();
      setOutput(data);
      setNodes((nds) =>
        nds.map((n) =>
          n.id === '1'
            ? { ...n, data: { ...n.data, prompt: data.optimized_prompt } }
            : n
        )
      );
    } catch (err) {
      console.error('Optimization failed:', err);
    } finally {
      setIsOptimizing(false);
    }
  };

  const renderedNodes = useMemo(() => {
    return nodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        isOptimizing,
        onOptimize: handleOptimize,
        onChange: (val: string) => {
          setNodes((nds) =>
            nds.map((node) => (node.id === n.id ? { ...node, data: { ...node.data, prompt: val } } : node))
          );
        }
      }
    }));
  }, [nodes, isOptimizing]);

  return (
    <div className="flex h-screen w-full bg-slate-950 font-sans">
      <div className="flex-1 h-full relative">
        <ReactFlow
          nodes={renderedNodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
        >
          <Background color="#334155" gap={16} />
          <Controls />
        </ReactFlow>
      </div>

      <div className="w-96 border-l border-slate-800 bg-slate-900 p-6 text-slate-200 flex flex-col gap-4 overflow-y-auto">
        <h2 className="text-lg font-bold text-white border-b border-slate-800 pb-2">Pipeline Benchmarks</h2>
        {output ? (
          <div className="space-y-4 text-xs">
            <div className="bg-slate-950 p-3 rounded border border-slate-800">
              <span className="text-slate-400 block mb-1">Quality Score</span>
              <span className="text-2xl font-bold text-emerald-400">{output.quality_score} / 100</span>
            </div>
            <div className="bg-slate-950 p-3 rounded border border-slate-800">
              <span className="text-slate-400 block mb-1">Model Cascade Executed</span>
              <span className="font-mono text-indigo-400">{output.model_used}</span>
            </div>
            <div className="bg-slate-950 p-3 rounded border border-slate-800">
              <span className="text-slate-400 block mb-1">Tuning Iterations Used</span>
              <span className="font-bold text-white">{output.iterations_used} steps</span>
            </div>
            <div className="bg-slate-950 p-3 rounded border border-slate-800">
              <span className="text-slate-400 block mb-1">Final Optimized Output</span>
              <pre className="bg-slate-900 p-2 rounded font-mono text-slate-300 text-[10px] overflow-x-auto">
                {output.final_output}
              </pre>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            Click "Auto-Tune Pipeline" on a node to initiate the Gemini self-reflection loop and view real-time vector metrics.
          </p>
        )}
      </div>
    </div>
  );
}