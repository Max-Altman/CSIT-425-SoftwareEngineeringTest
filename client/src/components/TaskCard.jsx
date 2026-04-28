export default function TaskCard({
  task,
  currentUserId,
  onDelete,
  onStatusChange,
  onAssignChange
}) {
  const isOwner = task.userId === currentUserId;

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        padding: "15px",
        marginBottom: "10px",
        borderRadius: "10px",
        backgroundColor: "var(--card)"
      }}
    >
      <h4>{task.title}</h4>

      <p style={{ margin: "0 0 10px 0", color: "var(--text-muted)" }}>
        Created by: {task.createdBy || "Unknown"}
      </p>

      {task.description && (
        <p style={{ margin: "0 0 12px 0", color: "var(--text)", whiteSpace: "pre-wrap" }}>
          {task.description}
        </p>
      )}

      <div style={{ marginBottom: "10px" }}>
        <label>Status: </label>
        <select
          value={task.status}
          onChange={(e) =>
            onStatusChange(task.id, e.target.value)
          }
          disabled={!isOwner}
          style={{ opacity: isOwner ? 1 : 0.6 }}
        >
            <option value="pending">Todo</option>
          <option value="in-progress">In Progress</option>
          <option value="completed">Done</option>
        </select>
      </div>

      <div style={{ marginBottom: "10px" }}>
        <label>Assign: </label>
        <select
          value={task.assignedTo}
          onChange={(e) =>
            onAssignChange(task.id, e.target.value)
          }
          disabled={!isOwner}
          style={{ opacity: isOwner ? 1 : 0.6 }}
        >
          <option value="You">You</option>
          <option value="Teammate">Teammate</option>
          <option value="Team Lead">Team Lead</option>
        </select>
      </div>

      <button
        onClick={() => onDelete(task.id)}
        disabled={!isOwner}
        style={{
          backgroundColor: isOwner ? "var(--danger)" : "#ccc",
          color: "white",
          border: "none",
          padding: "6px 10px",
          borderRadius: "5px",
          cursor: isOwner ? "pointer" : "not-allowed"
        }}
      >
        Delete
      </button>

      {!isOwner && (
        <p style={{ marginTop: "10px", fontStyle: "italic", color: "#666" }}>
          You can view this task but cannot edit or delete tasks created by other users.
        </p>
      )}
    </div>
  );
}