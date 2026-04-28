import { useState } from 'react';
import { apiUrl } from '../api';

export default function AddTask({
  newTask,
  setNewTask,
  newDescription,
  setNewDescription,
  handleAddTask,
  handleAddMultipleTasks
}) {
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  const handleGenerateTasks = async () => {
    if (!aiPrompt.trim()) return;

    setIsGenerating(true);
    try {
      const response = await fetch(apiUrl('/api/gemini/generate-tasks'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: aiPrompt }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuggestions(data.suggestions);
      } else if (response.status === 429) {
        // Quota exceeded - provide fallback suggestions
        const fallbackSuggestions = generateFallbackSuggestions(aiPrompt);
        setSuggestions(fallbackSuggestions);
        console.warn('AI API quota exceeded:', data);
        alert('AI service quota exceeded. Showing sample suggestions instead. Please try again in a few minutes.');
      } else {
        console.error('Failed to generate tasks:', response.status, data);
        const fallbackSuggestions = generateFallbackSuggestions(aiPrompt);
        setSuggestions(fallbackSuggestions);
        alert('Could not reach AI service. Showing sample suggestions instead. Please try again.');
      }
    } catch (error) {
      console.error('Error generating tasks:', error);
      // Provide fallback suggestions on network errors too
      const fallbackSuggestions = generateFallbackSuggestions(aiPrompt);
      setSuggestions(fallbackSuggestions);
      alert('Error connecting to AI service. Showing sample suggestions instead.');
    } finally {
      setIsGenerating(false);
    }
  };

  const generateFallbackSuggestions = (prompt) => {
    // Simple fallback suggestions based on common task categories
    const lowerPrompt = prompt.toLowerCase();
    
    if (lowerPrompt.includes('birthday') || lowerPrompt.includes('party')) {
      return [
        { title: 'Plan guest list', description: 'Create a list of people to invite to the party' },
        { title: 'Choose venue', description: 'Decide where to hold the birthday party' },
        { title: 'Send invitations', description: 'Send out invitations with date, time, and location' },
        { title: 'Buy decorations', description: 'Purchase balloons, banners, and party supplies' },
        { title: 'Order cake', description: 'Order or bake a birthday cake' }
      ];
    } else if (lowerPrompt.includes('project') || lowerPrompt.includes('work')) {
      return [
        { title: 'Define project scope', description: 'Clearly outline what the project will accomplish' },
        { title: 'Create timeline', description: 'Set deadlines for each phase of the project' },
        { title: 'Assign team members', description: 'Determine who will work on each part' },
        { title: 'Gather resources', description: 'Collect necessary tools and materials' },
        { title: 'Set up communication', description: 'Establish how the team will communicate' }
      ];
    } else {
      return [
        { title: 'Break down the task', description: 'Divide the main task into smaller, manageable steps' },
        { title: 'Set priorities', description: 'Determine which steps are most important' },
        { title: 'Gather information', description: 'Research and collect needed information' },
        { title: 'Create a plan', description: 'Outline the steps needed to complete the task' },
        { title: 'Set deadlines', description: 'Establish realistic timeframes for completion' }
      ];
    }
  };

  const handleUseSuggestion = (suggestion, action = 'title') => {
    if (action === 'title') {
      setNewTask(suggestion.title);
    } else if (action === 'description') {
      setNewDescription(suggestion.description || suggestion.title);
    } else if (action === 'both') {
      setNewTask(suggestion.title);
      setNewDescription(suggestion.description || '');
    }
    // Keep suggestions visible so user can use multiple ones
  };

  const handleUseAllSuggestions = () => {
    if (handleAddMultipleTasks) {
      const confirmed = window.confirm(`Add all ${suggestions.length} suggested tasks to your list?`);
      if (confirmed) {
        handleAddMultipleTasks(suggestions);
        setSuggestions([]);
        setAiPrompt('');
      }
    } else {
      alert(`Would add ${suggestions.length} tasks. Feature coming soon!`);
    }
  };

  const handleClearSuggestions = () => {
    setSuggestions([]);
    setAiPrompt('');
  };

  return (
    <div style={{ margin: "20px 0" }}>
      <div style={{ display: "flex", gap: "10px", marginBottom: "10px", flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Task title"
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          style={{
            padding: "10px",
            borderRadius: "6px",
            border: "1px solid var(--border)",
            flex: 1,
            minWidth: '200px'
          }}
        />
        <input
          type="text"
          placeholder="Task description"
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
          style={{
            padding: "10px",
            borderRadius: "6px",
            border: "1px solid var(--border)",
            flex: 1,
            minWidth: '200px'
          }}
        />

        <button
          onClick={handleAddTask}
          style={{
            backgroundColor: "var(--primary)",
            color: "white",
            border: "none",
            padding: "10px 14px",
            borderRadius: "6px"
          }}
        >
          Add Task
        </button>
      </div>

      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        <input
          type="text"
          placeholder="Describe what tasks you need..."
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          style={{
            padding: "8px",
            borderRadius: "6px",
            border: "1px solid var(--border)",
            flex: 1
          }}
        />

        <button
          onClick={handleGenerateTasks}
          disabled={isGenerating || !aiPrompt.trim()}
          style={{
            backgroundColor: isGenerating ? "#ccc" : "#007bff",
            color: "white",
            border: "none",
            padding: "8px 12px",
            borderRadius: "6px",
            cursor: isGenerating ? "not-allowed" : "pointer"
          }}
        >
          {isGenerating ? "Generating..." : "Generate with AI"}
        </button>
      </div>

      {suggestions.length > 0 && (
        <div style={{ marginTop: "10px", padding: "10px", border: "1px solid #ddd", borderRadius: "6px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <h4 style={{ margin: 0 }}>AI Suggestions:</h4>
            <div style={{ display: "flex", gap: "5px" }}>
              <button
                onClick={handleUseAllSuggestions}
                style={{
                  backgroundColor: "#17a2b8",
                  color: "white",
                  border: "none",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "12px"
                }}
              >
                Use All
              </button>
              <button
                onClick={handleClearSuggestions}
                style={{
                  backgroundColor: "#6c757d",
                  color: "white",
                  border: "none",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "12px"
                }}
              >
                Clear
              </button>
            </div>
          </div>
          {Array.isArray(suggestions) ? (
            suggestions.map((suggestion, index) => (
              <div key={index} style={{ marginBottom: "12px", padding: "8px", backgroundColor: "#f8f9fa", borderRadius: "4px" }}>
                <div style={{ marginBottom: "6px" }}>
                  <strong>{suggestion.title}</strong>
                  {suggestion.description && <p style={{ margin: "4px 0", fontSize: "14px", color: "#666" }}>{suggestion.description}</p>}
                </div>
                <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                  <button
                    onClick={() => handleUseSuggestion(suggestion, 'title')}
                    style={{
                      backgroundColor: "#28a745",
                      color: "white",
                      border: "none",
                      padding: "4px 8px",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "12px"
                    }}
                  >
                    Use Title
                  </button>
                  {suggestion.description && (
                    <>
                      <button
                        onClick={() => handleUseSuggestion(suggestion, 'description')}
                        style={{
                          backgroundColor: "#007bff",
                          color: "white",
                          border: "none",
                          padding: "4px 8px",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "12px"
                        }}
                      >
                        Use Description
                      </button>
                      <button
                        onClick={() => handleUseSuggestion(suggestion, 'both')}
                        style={{
                          backgroundColor: "#fd7e14",
                          color: "white",
                          border: "none",
                          padding: "4px 8px",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "12px"
                        }}
                      >
                        Use Both
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p>{suggestions}</p>
          )}
        </div>
      )}
    </div>
  );
}