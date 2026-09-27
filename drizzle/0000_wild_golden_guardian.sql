CREATE TABLE `activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_type` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer NOT NULL,
	`project_id` integer,
	`actor_id` integer NOT NULL,
	`source` text NOT NULL,
	`before` text DEFAULT '{}' NOT NULL,
	`after` text DEFAULT '{}' NOT NULL,
	`occurred_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "activities_event_type_check" CHECK("activities"."event_type" in ('actor.created', 'actor.permissions_changed', 'token.issued', 'token.revoked', 'project.created', 'project.updated', 'project.document_linked', 'project.document_unlinked', 'project.completed', 'project.archived', 'task.created', 'task.updated', 'task.assignee_changed', 'task.parent_changed', 'task.moved', 'task.document_linked', 'task.document_unlinked', 'task.started', 'task.blocked', 'task.review_requested', 'task.approved', 'task.returned_to_todo', 'task.cancelled', 'task.commented', 'task.auto_started', 'task.auto_cancelled', 'task.auto_moved', 'document.created', 'document.updated', 'document.archived', 'inbox_item.captured', 'inbox_item.updated', 'inbox_item.converted', 'inbox_item.archived')),
	CONSTRAINT "activities_entity_type_check" CHECK("activities"."entity_type" in ('actor', 'token', 'project', 'task', 'document', 'inbox_item')),
	CONSTRAINT "activities_source_check" CHECK("activities"."source" in ('web', 'mcp'))
);
--> statement-breakpoint
CREATE INDEX `activities_entity_idx` ON `activities` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `activities_project_id_idx` ON `activities` (`project_id`);--> statement-breakpoint
CREATE TABLE `actors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_type` text NOT NULL,
	`name` text NOT NULL,
	`perm_project` text NOT NULL,
	`perm_task` text NOT NULL,
	`perm_document` text NOT NULL,
	`perm_inbox` text NOT NULL,
	CONSTRAINT "actors_actor_type_check" CHECK("actors"."actor_type" in ('human', 'agent')),
	CONSTRAINT "actors_perm_project_check" CHECK("actors"."perm_project" in ('none', 'read', 'readwrite')),
	CONSTRAINT "actors_perm_task_check" CHECK("actors"."perm_task" in ('none', 'read', 'readwrite')),
	CONSTRAINT "actors_perm_document_check" CHECK("actors"."perm_document" in ('none', 'read', 'readwrite')),
	CONSTRAINT "actors_perm_inbox_check" CHECK("actors"."perm_inbox" in ('none', 'read', 'readwrite'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `actors_name_unique` ON `actors` (`name`);--> statement-breakpoint
CREATE TABLE `human_credentials` (
	`actor_id` integer PRIMARY KEY NOT NULL,
	`login_name` text NOT NULL,
	`password_hash` text NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `human_credentials_loginName_unique` ON `human_credentials` (`login_name`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_id` integer NOT NULL,
	`session_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_sessionHash_unique` ON `sessions` (`session_hash`);--> statement-breakpoint
CREATE INDEX `sessions_actor_id_idx` ON `sessions` (`actor_id`);--> statement-breakpoint
CREATE TABLE `tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`issued_at` text NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tokens_tokenHash_unique` ON `tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `tokens_actor_id_idx` ON `tokens` (`actor_id`);--> statement-breakpoint
CREATE TABLE `document_tags` (
	`document_id` integer NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`document_id`, `tag`),
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `document_tags_tag_idx` ON `document_tags` (`tag`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`created_by` integer NOT NULL,
	`updated_by` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "documents_status_check" CHECK("documents"."status" in ('active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE `inbox_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`content` text NOT NULL,
	`status` text NOT NULL,
	`created_by` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "inbox_items_status_check" CHECK("inbox_items"."status" in ('untriaged', 'triaged', 'archived'))
);
--> statement-breakpoint
CREATE TABLE `project_documents` (
	`project_id` integer NOT NULL,
	`document_id` integer NOT NULL,
	PRIMARY KEY(`project_id`, `document_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `project_documents_document_id_idx` ON `project_documents` (`document_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`instructions` text DEFAULT '' NOT NULL,
	`repositories` text DEFAULT '[]' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "projects_status_check" CHECK("projects"."status" in ('active', 'done', 'archived'))
);
--> statement-breakpoint
CREATE TABLE `task_comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer NOT NULL,
	`body` text NOT NULL,
	`created_by` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `task_comments_task_id_idx` ON `task_comments` (`task_id`);--> statement-breakpoint
CREATE TABLE `task_documents` (
	`task_id` integer NOT NULL,
	`document_id` integer NOT NULL,
	PRIMARY KEY(`task_id`, `document_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `task_documents_document_id_idx` ON `task_documents` (`document_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`acceptance_criteria` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`project_id` integer,
	`parent_id` integer,
	`assignee_id` integer,
	`result` text DEFAULT '' NOT NULL,
	`blocked_reason` text DEFAULT '' NOT NULL,
	`links` text DEFAULT '[]' NOT NULL,
	`created_by` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignee_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "tasks_status_check" CHECK("tasks"."status" in ('todo', 'in_progress', 'blocked', 'review', 'done', 'cancelled')),
	CONSTRAINT "tasks_priority_check" CHECK("tasks"."priority" in ('high', 'normal', 'low'))
);
--> statement-breakpoint
CREATE INDEX `tasks_parent_id_idx` ON `tasks` (`parent_id`);--> statement-breakpoint
CREATE INDEX `tasks_project_id_idx` ON `tasks` (`project_id`);--> statement-breakpoint
CREATE INDEX `tasks_assignee_id_idx` ON `tasks` (`assignee_id`);