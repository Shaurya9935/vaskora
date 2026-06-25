import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  text,
  integer,
  pgEnum,
} from "drizzle-orm/pg-core";
import { user } from "./user"; 
import { featureRequest } from "./feature-request";

export const pullRequestStatusEnum = pgEnum('pull_request_status', [
  'pending', 
  'processing', 
  'reviewed', 
  'rate_limited'
]);

export const githubInstallation = pgTable("github_installation", {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').references(() => user.id),
 
  installationId: varchar('installation_id', { length: 50 }).notNull().unique(),
  accountLogin: text('account_login'),
  
  accountType: text('account_type'), 
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const pullRequest = pgTable('pull_request', {
  id: uuid('id').primaryKey().defaultRandom(),
  installationId: varchar('installation_id').references(() => githubInstallation.installationId),
  
  featureRequestId: uuid('feature_request_id').references(() => featureRequest.id),

  repoFullName: text('repo_full_name').notNull(),
  
  prNumber: integer('pr_number').notNull(),
  title: text('title').notNull(),
  authorLogin: text('author_login').notNull(),
  headSha: text('head_sha').notNull(),
  
  baseBranch: text('base_branch'),
  status: pullRequestStatusEnum('status').default('pending'),
  reviewComment: text('review_comment'),
  
  reviewedAt: timestamp('reviewed_at'), 
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});