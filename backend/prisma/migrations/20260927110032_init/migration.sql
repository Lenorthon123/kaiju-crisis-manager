-- CreateEnum
CREATE TYPE "Role" AS ENUM ('QC', 'LC', 'CD');

-- CreateEnum
CREATE TYPE "LinkType" AS ENUM ('LAND', 'SEA');

-- CreateEnum
CREATE TYPE "ActionKey" AS ENUM ('VIEW_RESOURCES', 'RESERVE_OWN_QUARTER', 'REQUEST_ADJACENT_TRANSFER', 'ORGANIZE_TRANSIT', 'REQUISITION', 'LOWER_RETENTION_THRESHOLD');

-- CreateEnum
CREATE TYPE "TransferMode" AS ENUM ('DIRECT', 'TRANSIT', 'MARITIME');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING_SOURCE_APPROVAL', 'PENDING_TRANSIT_APPROVAL', 'APPROVED', 'IN_TRANSIT', 'DELIVERED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LegStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'IN_TRANSIT', 'DELIVERED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('ALLOWED', 'REJECTED');

-- CreateTable
CREATE TABLE "districts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hasSeaAccess" BOOLEAN NOT NULL DEFAULT false,
    "isHub" BOOLEAN NOT NULL DEFAULT false,
    "severity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "districts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topology_edges" (
    "id" TEXT NOT NULL,
    "fromNode" TEXT NOT NULL,
    "toNode" TEXT NOT NULL,
    "type" "LinkType" NOT NULL,

    CONSTRAINT "topology_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'unit',
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "resource_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stocks" (
    "id" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "resourceTypeId" TEXT NOT NULL,
    "initialQuantity" INTEGER NOT NULL,
    "currentQuantity" INTEGER NOT NULL,
    "reservedQuantity" INTEGER NOT NULL DEFAULT 0,
    "committedOutbound" INTEGER NOT NULL DEFAULT 0,
    "retentionBase" INTEGER NOT NULL,

    CONSTRAINT "stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "city_state" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "catastropheLevel" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "city_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catastrophe_level_changes" (
    "id" TEXT NOT NULL,
    "previousLevel" INTEGER NOT NULL,
    "newLevel" INTEGER NOT NULL,
    "reason" TEXT,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catastrophe_level_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retention_overrides" (
    "id" TEXT NOT NULL,
    "districtId" TEXT,
    "pct" DECIMAL(4,3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "retention_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_rules" (
    "id" TEXT NOT NULL,
    "action" "ActionKey" NOT NULL,
    "level" INTEGER NOT NULL,
    "role" "Role" NOT NULL,

    CONSTRAINT "permission_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "districtId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "resourceTypeId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfers" (
    "id" TEXT NOT NULL,
    "initiatorId" TEXT NOT NULL,
    "sourceDistrictId" TEXT NOT NULL,
    "destDistrictId" TEXT NOT NULL,
    "resourceTypeId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "mode" "TransferMode" NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING_SOURCE_APPROVAL',
    "isRequisition" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "etaHours" INTEGER NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "departureAt" TIMESTAMP(3),
    "estimatedDeliveryAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "rejectionCode" TEXT,
    "rejectionReason" TEXT,

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_legs" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "fromNode" TEXT NOT NULL,
    "toNode" TEXT NOT NULL,
    "linkType" "LinkType" NOT NULL,
    "approvalRequired" BOOLEAN NOT NULL DEFAULT false,
    "status" "LegStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "etaHours" INTEGER NOT NULL,

    CONSTRAINT "transfer_legs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "outcome" "AuditOutcome" NOT NULL,
    "violationCode" TEXT,
    "httpStatus" INTEGER,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "districts_code_key" ON "districts"("code");

-- CreateIndex
CREATE UNIQUE INDEX "topology_edges_fromNode_toNode_key" ON "topology_edges"("fromNode", "toNode");

-- CreateIndex
CREATE UNIQUE INDEX "resource_types_code_key" ON "resource_types"("code");

-- CreateIndex
CREATE INDEX "stocks_resourceTypeId_idx" ON "stocks"("resourceTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "stocks_districtId_resourceTypeId_key" ON "stocks"("districtId", "resourceTypeId");

-- CreateIndex
CREATE INDEX "catastrophe_level_changes_changedAt_idx" ON "catastrophe_level_changes"("changedAt");

-- CreateIndex
CREATE INDEX "retention_overrides_active_idx" ON "retention_overrides"("active");

-- CreateIndex
CREATE INDEX "permission_rules_level_idx" ON "permission_rules"("level");

-- CreateIndex
CREATE UNIQUE INDEX "permission_rules_action_level_role_key" ON "permission_rules"("action", "level", "role");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_districtId_idx" ON "users"("districtId");

-- CreateIndex
CREATE INDEX "reservations_districtId_startAt_idx" ON "reservations"("districtId", "startAt");

-- CreateIndex
CREATE INDEX "reservations_status_idx" ON "reservations"("status");

-- CreateIndex
CREATE INDEX "transfers_status_priority_idx" ON "transfers"("status", "priority");

-- CreateIndex
CREATE INDEX "transfers_sourceDistrictId_idx" ON "transfers"("sourceDistrictId");

-- CreateIndex
CREATE INDEX "transfers_destDistrictId_idx" ON "transfers"("destDistrictId");

-- CreateIndex
CREATE UNIQUE INDEX "transfer_legs_transferId_sequence_key" ON "transfer_legs"("transferId", "sequence");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_violationCode_idx" ON "audit_logs"("violationCode");

-- AddForeignKey
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "districts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_resourceTypeId_fkey" FOREIGN KEY ("resourceTypeId") REFERENCES "resource_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catastrophe_level_changes" ADD CONSTRAINT "catastrophe_level_changes_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_overrides" ADD CONSTRAINT "retention_overrides_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_overrides" ADD CONSTRAINT "retention_overrides_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_resourceTypeId_fkey" FOREIGN KEY ("resourceTypeId") REFERENCES "resource_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_initiatorId_fkey" FOREIGN KEY ("initiatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_sourceDistrictId_fkey" FOREIGN KEY ("sourceDistrictId") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_destDistrictId_fkey" FOREIGN KEY ("destDistrictId") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_resourceTypeId_fkey" FOREIGN KEY ("resourceTypeId") REFERENCES "resource_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_legs" ADD CONSTRAINT "transfer_legs_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_legs" ADD CONSTRAINT "transfer_legs_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
