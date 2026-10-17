-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "googleSub" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enterToSend" BOOLEAN NOT NULL DEFAULT true,
    "theme" TEXT NOT NULL DEFAULT 'system',
    "alwaysLoadRemoteImages" BOOLEAN NOT NULL DEFAULT false,
    "pollIntervalSec" INTEGER NOT NULL DEFAULT 45,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'gmail',
    "emailAddress" TEXT NOT NULL,
    "googleSub" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pushExpiration" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailThread" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "gmailThreadId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "snippet" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "messageCount" INTEGER NOT NULL,
    "unreadCount" INTEGER NOT NULL,
    "labelIds" TEXT[],
    "inInbox" BOOLEAN NOT NULL,
    "starred" BOOLEAN NOT NULL,
    "hasSent" BOOLEAN NOT NULL,
    "hidden" BOOLEAN NOT NULL,
    "hasAttachments" BOOLEAN NOT NULL,
    "isGroup" BOOLEAN NOT NULL,
    "isSelfThread" BOOLEAN NOT NULL,
    "groupKey" TEXT,
    "counterpartEmail" TEXT,
    "lastFromMe" BOOLEAN NOT NULL,
    "lastSenderEmail" TEXT,
    "lastSenderName" TEXT,
    "participantsJson" JSONB NOT NULL DEFAULT '[]',
    "historyId" TEXT,
    "listedAt" TIMESTAMP(3),
    "indexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "gmailThreadId" TEXT NOT NULL,
    "rfcMessageId" TEXT,
    "inReplyTo" TEXT,
    "references" TEXT,
    "subject" TEXT NOT NULL,
    "snippet" TEXT NOT NULL,
    "internalDate" TIMESTAMP(3) NOT NULL,
    "labelIds" TEXT[],
    "isUnread" BOOLEAN NOT NULL,
    "isStarred" BOOLEAN NOT NULL,
    "isFromMe" BOOLEAN NOT NULL,
    "fromEmail" TEXT,
    "fromName" TEXT,
    "toJson" JSONB NOT NULL DEFAULT '[]',
    "ccJson" JSONB NOT NULL DEFAULT '[]',
    "bccJson" JSONB NOT NULL DEFAULT '[]',
    "replyToJson" JSONB NOT NULL DEFAULT '[]',
    "hasAttachments" BOOLEAN NOT NULL,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThreadParticipant" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "roles" TEXT[],
    "messageCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ThreadParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttachmentMetadata" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "gmailAttachmentId" TEXT,
    "partId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "contentId" TEXT,
    "isInline" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AttachmentMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncState" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "historyId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "initialSyncComplete" BOOLEAN NOT NULL DEFAULT false,
    "backfillComplete" BOOLEAN NOT NULL DEFAULT false,
    "backfillPageToken" TEXT,
    "backfillCount" INTEGER NOT NULL DEFAULT 0,
    "fullSyncStartedAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastFullSyncAt" TIMESTAMP(3),
    "lockedUntil" TIMESTAMP(3),
    "consecutiveErrors" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "threadCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "gmailDraftId" TEXT NOT NULL,
    "threadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundMessage" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rfcMessageId" TEXT NOT NULL,
    "gmailMessageId" TEXT,
    "gmailThreadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreference_userId_key" ON "UserPreference"("userId");

-- CreateIndex
CREATE INDEX "MailAccount_emailAddress_idx" ON "MailAccount"("emailAddress");

-- CreateIndex
CREATE UNIQUE INDEX "MailAccount_userId_provider_key" ON "MailAccount"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_accountId_email_key" ON "Contact"("accountId", "email");

-- CreateIndex
CREATE INDEX "EmailThread_accountId_lastMessageAt_idx" ON "EmailThread"("accountId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "EmailThread_accountId_groupKey_idx" ON "EmailThread"("accountId", "groupKey");

-- CreateIndex
CREATE INDEX "EmailThread_accountId_counterpartEmail_idx" ON "EmailThread"("accountId", "counterpartEmail");

-- CreateIndex
CREATE UNIQUE INDEX "EmailThread_accountId_gmailThreadId_key" ON "EmailThread"("accountId", "gmailThreadId");

-- CreateIndex
CREATE INDEX "EmailMessage_threadId_internalDate_idx" ON "EmailMessage"("threadId", "internalDate");

-- CreateIndex
CREATE INDEX "EmailMessage_accountId_rfcMessageId_idx" ON "EmailMessage"("accountId", "rfcMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_accountId_gmailMessageId_key" ON "EmailMessage"("accountId", "gmailMessageId");

-- CreateIndex
CREATE INDEX "ThreadParticipant_contactId_idx" ON "ThreadParticipant"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "ThreadParticipant_threadId_contactId_key" ON "ThreadParticipant"("threadId", "contactId");

-- CreateIndex
CREATE INDEX "AttachmentMetadata_accountId_gmailMessageId_idx" ON "AttachmentMetadata"("accountId", "gmailMessageId");

-- CreateIndex
CREATE INDEX "AttachmentMetadata_threadId_idx" ON "AttachmentMetadata"("threadId");

-- CreateIndex
CREATE UNIQUE INDEX "AttachmentMetadata_messageId_partId_key" ON "AttachmentMetadata"("messageId", "partId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncState_accountId_key" ON "SyncState"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Draft_accountId_gmailDraftId_key" ON "Draft"("accountId", "gmailDraftId");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundMessage_accountId_idempotencyKey_key" ON "OutboundMessage"("accountId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailAccount" ADD CONSTRAINT "MailAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailThread" ADD CONSTRAINT "EmailThread_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "EmailThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadParticipant" ADD CONSTRAINT "ThreadParticipant_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "EmailThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadParticipant" ADD CONSTRAINT "ThreadParticipant_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttachmentMetadata" ADD CONSTRAINT "AttachmentMetadata_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttachmentMetadata" ADD CONSTRAINT "AttachmentMetadata_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncState" ADD CONSTRAINT "SyncState_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
