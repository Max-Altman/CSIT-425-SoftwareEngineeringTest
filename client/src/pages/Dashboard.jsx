import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState } from "react";
import TaskList from "../components/TaskList";
import AddTask from "../components/AddTask";
import { apiUrl } from "../api";

export default function Dashboard() {
  const { isAuthenticated, user, isLoading } = useAuth0();
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [userId, setUserId] = useState(null);
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [error, setError] = useState("");

  // Fetch user ID and user list from database when user authenticates
  useEffect(() => {
    if (isAuthenticated && user?.sub) {
      fetchUserId();
      fetchUsers();
    }
  }, [isAuthenticated, user?.sub]);

  useEffect(() => {
    if (userId && selectedUserId === null) {
      setSelectedUserId(userId);
    }
  }, [userId, selectedUserId]);

  // Fetch tasks when the selected user changes
  useEffect(() => {
    if (selectedUserId) {
      fetchTasksForUser(selectedUserId);
    }
  }, [selectedUserId]);

  useEffect(() => {
    if (selectedUserId && users.length > 0 && tasks.length > 0) {
      const selectedUser = users.find((u) => u.id === Number(selectedUserId));
      if (selectedUser) {
        setTasks((prevTasks) =>
          prevTasks.map((task) => ({
            ...task,
            createdBy: selectedUser.name,
            assignedTo: task.userId === userId ? "You" : selectedUser.name
          }))
        );
      }
    }
  }, [users, selectedUserId, tasks.length, userId]);

  const fetchUserId = async () => {
    try {
      const response = await fetch(apiUrl(`/api/users/auth0/${user.sub}`));
      if (response.ok) {
        const data = await response.json();
        setUserId(data.user.id);
      } else {
        console.error("User not found in database");
        setError("User not found. Please refresh the page.");
      }
    } catch (error) {
      console.error("Error fetching user:", error);
      setError("Error loading user data");
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch(apiUrl('/api/users'));
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      setError('Error loading user list');
    }
  };

  const fetchTasksForUser = async (userIdToFetch) => {
    try {
      setTasksLoading(true);
      const response = await fetch(apiUrl(`/api/tasks/user/${userIdToFetch}`));
      if (response.ok) {
        const data = await response.json();
        const selectedUser = users.find((u) => u.id === Number(userIdToFetch));
        const fallbackName = Number(userIdToFetch) === userId ? user?.name || user?.email || "You" : "Other";
        const formattedTasks = data.tasks.map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status || "pending",
          assignedTo: task.user_id === userId ? "You" : selectedUser?.name || fallbackName,
          description: task.description,
          due_date: task.due_date,
          createdBy: selectedUser?.name || fallbackName,
          userId: task.user_id
        }));
        setTasks(formattedTasks);
      }
    } catch (error) {
      console.error("Error fetching tasks:", error);
      setError("Error loading tasks");
    } finally {
      setTasksLoading(false);
    }
  };

  // ➕ Add task to database
  const handleAddTask = async () => {
    if (!newTask.trim()) return;
    if (!userId) {
      setError("User ID not available. Please refresh the page.");
      return;
    }

    try {
      const response = await fetch(apiUrl("/api/tasks"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: userId,
          title: newTask,
          description: newDescription,
          status: "pending"
        })
      });

      if (response.ok) {
        const data = await response.json();
        const task = data.task;
        
        // Add to local state
        setTasks([...tasks, {
          id: task.id,
          title: task.title,
          status: task.status || "pending",
          assignedTo: "You",
          description: task.description,
          createdBy: "You",
          userId
        }]);
        setNewTask("");
        setNewDescription("");
        setError("");
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Error creating task");
      }
    } catch (error) {
      console.error("Error adding task:", error);
      setError("Error creating task");
    }
  };

  // ➕ Add multiple tasks to database
  const handleAddMultipleTasks = async (taskSuggestions) => {
    if (!userId) {
      setError("User ID not available. Please refresh the page.");
      return;
    }

    try {
      const newTasks = [];
      for (const suggestion of taskSuggestions) {
        const response = await fetch(apiUrl("/api/tasks"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: userId,
            title: suggestion.title,
            description: suggestion.description || "",
            status: "pending"
          })
        });

        if (response.ok) {
          const data = await response.json();
          const task = data.task;
          newTasks.push({
            id: task.id,
            title: task.title,
            status: task.status || "pending",
            assignedTo: "You",
            description: task.description,
            createdBy: "You",
            userId
          });
        }
      }

      // Add all new tasks to local state
      setTasks([...tasks, ...newTasks]);
      setError("");
    } catch (error) {
      console.error("Error adding multiple tasks:", error);
      setError("Error creating tasks");
    }
  };

  // ❌ Delete task from database
  const handleDeleteTask = async (id) => {
    try {
      const response = await fetch(apiUrl(`/api/tasks/${id}`), {
        method: "DELETE"
      });

      if (response.ok) {
        setTasks(tasks.filter(task => task.id !== id));
        setError("");
      } else {
        setError("Error deleting task");
      }
    } catch (error) {
      console.error("Error deleting task:", error);
      setError("Error deleting task");
    }
  };

  // 🔄 Update task status in database
  const handleStatusChange = async (id, newStatus) => {
    try {
      const response = await fetch(apiUrl(`/api/tasks/${id}`), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: newStatus
        })
      });

      if (response.ok) {
        setTasks(prevTasks =>
          prevTasks.map(task =>
            task.id === id ? { ...task, status: newStatus } : task
          )
        );
        setError("");
      } else {
        setError("Error updating task");
      }
    } catch (error) {
      console.error("Error updating task:", error);
      setError("Error updating task");
    }
  };

  // 👤 Assign user (for now, just update local state as backend doesn't have assignment field)
  const handleAssignChange = (id, userName) => {
    setTasks(prevTasks =>
      prevTasks.map(task =>
        task.id === id ? { ...task, assignedTo: userName } : task
      )
    );
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <div style={{ padding: "20px" }}>
      <h1>Task Management Dashboard</h1>

      <hr />

      {error && (
        <div style={{ color: "red", marginBottom: "10px", padding: "10px", backgroundColor: "#ffe0e0", borderRadius: "5px" }}>
          {error}
        </div>
      )}

      {!isAuthenticated && (
        <p>Please log in using the button in the top right.</p>
      )}

      {isAuthenticated && (
        <>
          <h2>Welcome {user?.email}</h2>

          <div style={{ margin: "20px 0" }}>
            <label htmlFor="user-select" style={{ marginRight: "10px" }}>
              View tasks for:
            </label>
            <select
              id="user-select"
              value={selectedUserId || ""}
              onChange={(e) => setSelectedUserId(Number(e.target.value))}
              style={{ padding: "8px", borderRadius: "6px", border: "1px solid var(--border)" }}
            >
              <option value="" disabled>Select a user</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.id === userId ? `You (${u.name})` : u.name}
                </option>
              ))}
            </select>
          </div>

          {tasksLoading ? (
            <p>Loading tasks...</p>
          ) : (
            <>
              {selectedUserId === userId && (
                <AddTask
                  newTask={newTask}
                  setNewTask={setNewTask}
                  newDescription={newDescription}
                  setNewDescription={setNewDescription}
                  handleAddTask={handleAddTask}
                  handleAddMultipleTasks={handleAddMultipleTasks}
                />
              )}

              <TaskList
                title={selectedUserId === userId ? "Your Tasks" : `Tasks for ${users.find((u) => u.id === selectedUserId)?.name || "Selected User"}`}
                tasks={tasks}
                currentUserId={userId}
                onDelete={handleDeleteTask}
                onStatusChange={handleStatusChange}
                onAssignChange={handleAssignChange}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}