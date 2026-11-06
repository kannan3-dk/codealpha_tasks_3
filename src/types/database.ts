export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface ProjectMemberCount {
  count: number;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  created_at: string;
  project_members?: ProjectMemberCount[] | { count: number };
}

export interface ProjectMember {
  project_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
}

export interface List {
  id: string;
  project_id: string;
  name: string;
  position: number;
  created_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  list_id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  created_by: string;
  priority: 'low' | 'medium' | 'high';
  due_date: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  assignee?: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  creator?: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  comments?: Array<{ count: number }> | { count: number };
}

export interface ProjectMemberDetail {
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
  profile: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

export interface TaskWithProject extends Task {
  project?: {
    id: string;
    name: string;
  } | null;
  list?: {
    id: string;
    name: string;
  } | null;
}

export interface Comment {
  id: string;
  task_id: string;
  author_id: string;
  content: string;
  created_at: string;
}

export interface CommentWithProfile extends Comment {
  profiles?: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | Array<{
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  }> | null;
}

export interface Notification {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: string;
  message: string;
  project_id: string | null;
  task_id: string | null;
  read: boolean;
  created_at: string;
}

export interface NotificationWithActor extends Notification {
  actor?: {
    username: string;
    display_name: string | null;
  } | null;
}
