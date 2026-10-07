PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__new_actors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_type` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`perm_project` text NOT NULL,
	`perm_task` text NOT NULL,
	`perm_document` text NOT NULL,
	`perm_inbox` text NOT NULL,
	CONSTRAINT "actors_status_check" CHECK("__new_actors"."status" in ('active', 'archived')),
	CONSTRAINT "actors_actor_type_check" CHECK("__new_actors"."actor_type" in ('human', 'agent')),
	CONSTRAINT "actors_perm_project_check" CHECK("__new_actors"."perm_project" in ('none', 'read', 'readwrite')),
	CONSTRAINT "actors_perm_task_check" CHECK("__new_actors"."perm_task" in ('none', 'read', 'readwrite')),
	CONSTRAINT "actors_perm_document_check" CHECK("__new_actors"."perm_document" in ('none', 'read', 'readwrite')),
	CONSTRAINT "actors_perm_inbox_check" CHECK("__new_actors"."perm_inbox" in ('none', 'read', 'readwrite'))
);

--> statement-breakpoint
INSERT INTO `__new_actors`("id", "actor_type", "name", "status", "perm_project", "perm_task", "perm_document", "perm_inbox") SELECT "id", "actor_type", "name", 'active', "perm_project", "perm_task", "perm_document", "perm_inbox" FROM `actors`;
--> statement-breakpoint
DROP TABLE `actors`;
--> statement-breakpoint
ALTER TABLE `__new_actors` RENAME TO `actors`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
--> statement-breakpoint
CREATE UNIQUE INDEX `actors_active_name_unique` ON `actors` (`name`) WHERE "actors"."status" = 'active';
