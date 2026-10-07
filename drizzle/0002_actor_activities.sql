PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__new_activities` (
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
	CONSTRAINT "activities_event_type_check" CHECK("__new_activities"."event_type" in ('actor.created', 'actor.renamed', 'actor.archived', 'actor.permissions_changed', 'token.issued', 'token.revoked', 'project.created', 'project.updated', 'project.document_linked', 'project.document_unlinked', 'project.completed', 'project.archived', 'task.created', 'task.updated', 'task.assignee_changed', 'task.parent_changed', 'task.moved', 'task.document_linked', 'task.document_unlinked', 'task.started', 'task.blocked', 'task.review_requested', 'task.approved', 'task.returned_to_todo', 'task.cancelled', 'task.commented', 'task.auto_started', 'task.auto_cancelled', 'task.auto_moved', 'task.auto_assignee_changed', 'document.created', 'document.updated', 'document.archived', 'inbox_item.captured', 'inbox_item.updated', 'inbox_item.converted', 'inbox_item.archived')),
	CONSTRAINT "activities_entity_type_check" CHECK("__new_activities"."entity_type" in ('actor', 'token', 'project', 'task', 'document', 'inbox_item')),
	CONSTRAINT "activities_source_check" CHECK("__new_activities"."source" in ('web', 'mcp'))
);

--> statement-breakpoint
INSERT INTO `__new_activities`("id", "event_type", "entity_type", "entity_id", "project_id", "actor_id", "source", "before", "after", "occurred_at") SELECT "id", "event_type", "entity_type", "entity_id", "project_id", "actor_id", "source", "before", "after", "occurred_at" FROM `activities`;
--> statement-breakpoint
DROP TABLE `activities`;
--> statement-breakpoint
ALTER TABLE `__new_activities` RENAME TO `activities`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
--> statement-breakpoint
CREATE INDEX `activities_entity_idx` ON `activities` (`entity_type`,`entity_id`);
--> statement-breakpoint
CREATE INDEX `activities_project_id_idx` ON `activities` (`project_id`);
