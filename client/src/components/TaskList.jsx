import TaskCard from "./TaskCard";

export default function TaskList({
  title,
  tasks,
  onDelete,
  onStatusChange,
  onAssignChange,
  currentUserId
}) {
  return (
    <div>
      <h3>{title}</h3>

      {tasks.length === 0 ? (
        <p>No tasks yet</p>
      ) : (
        tasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            currentUserId={currentUserId}
            onDelete={onDelete}
            onStatusChange={onStatusChange}
            onAssignChange={onAssignChange}
          />
        ))
      )}
    </div>
  );
}