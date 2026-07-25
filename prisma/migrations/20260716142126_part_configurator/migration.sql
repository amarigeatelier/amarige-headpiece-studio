-- CreateEnum
CREATE TYPE "PartStatus" AS ENUM ('draft', 'active', 'inactive');

-- CreateEnum
CREATE TYPE "AttachmentStyle" AS ENUM ('comb', 'clip', 'tiara');

-- CreateEnum
CREATE TYPE "StyleCategory" AS ENUM ('wa', 'yo');

-- CreateEnum
CREATE TYPE "HairState" AS ENUM ('up', 'down');

-- CreateEnum
CREATE TYPE "PreviewStatus" AS ENUM ('pending_review', 'approved', 'rejected', 'failed');

-- CreateEnum
CREATE TYPE "CompositeStatus" AS ENUM ('ready', 'failed');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'paid', 'fulfilled', 'cancelled');

-- CreateTable
CREATE TABLE "Part" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sizeNote" TEXT,
    "addOnPriceJpy" INTEGER NOT NULL,
    "attachmentStyle" "AttachmentStyle" NOT NULL,
    "displayCategory" TEXT,
    "cutoutImageUrl" TEXT NOT NULL,
    "status" "PartStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Part_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelBasePhoto" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "styleCategory" "StyleCategory" NOT NULL,
    "hairState" "HairState" NOT NULL,
    "attachmentZone" TEXT NOT NULL,
    "compatibleAttachmentStyles" "AttachmentStyle"[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelBasePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartSoloPreview" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "basePhotoId" TEXT NOT NULL,
    "imageUrl" TEXT,
    "status" "PreviewStatus" NOT NULL DEFAULT 'pending_review',
    "promptVersion" TEXT NOT NULL,
    "errorMessage" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartSoloPreview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedComposite" (
    "id" TEXT NOT NULL,
    "basePhotoId" TEXT NOT NULL,
    "combinationKey" TEXT NOT NULL,
    "partIds" TEXT[],
    "imageUrl" TEXT,
    "status" "CompositeStatus" NOT NULL DEFAULT 'ready',
    "promptVersion" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastServedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedComposite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreSetting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "basePriceJpy" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingCheckout" (
    "id" TEXT NOT NULL,
    "basePhotoId" TEXT NOT NULL,
    "compositeId" TEXT,
    "partIds" TEXT[],
    "partsSnapshot" JSONB NOT NULL,
    "basePriceJpy" INTEGER NOT NULL,
    "totalPriceJpy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "PendingCheckout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationAttempt" (
    "id" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "bonusLimit" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GenerationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationCreditPurchase" (
    "id" TEXT NOT NULL,
    "stripeCheckoutSessionId" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "creditsGranted" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationCreditPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreviewLead" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreviewLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "stripeCheckoutSessionId" TEXT NOT NULL,
    "pendingCheckoutId" TEXT,
    "customerEmail" TEXT NOT NULL,
    "shippingAddress" JSONB NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'pending',
    "totalAmountJpy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "basePhotoId" TEXT,
    "compositeId" TEXT,
    "compositeImageUrl" TEXT,
    "basePriceJpy" INTEGER NOT NULL,
    "unitPriceJpy" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItemPart" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "partNameSnapshot" TEXT NOT NULL,
    "addOnPriceJpySnapshot" INTEGER NOT NULL,

    CONSTRAINT "OrderItemPart_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Part_slug_key" ON "Part"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "PartSoloPreview_partId_basePhotoId_key" ON "PartSoloPreview"("partId", "basePhotoId");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedComposite_combinationKey_key" ON "GeneratedComposite"("combinationKey");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationAttempt_ipHash_day_key" ON "GenerationAttempt"("ipHash", "day");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationCreditPurchase_stripeCheckoutSessionId_key" ON "GenerationCreditPurchase"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_stripeCheckoutSessionId_key" ON "Order"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItemPart_orderItemId_partId_key" ON "OrderItemPart"("orderItemId", "partId");

-- AddForeignKey
ALTER TABLE "PartSoloPreview" ADD CONSTRAINT "PartSoloPreview_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartSoloPreview" ADD CONSTRAINT "PartSoloPreview_basePhotoId_fkey" FOREIGN KEY ("basePhotoId") REFERENCES "ModelBasePhoto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedComposite" ADD CONSTRAINT "GeneratedComposite_basePhotoId_fkey" FOREIGN KEY ("basePhotoId") REFERENCES "ModelBasePhoto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingCheckout" ADD CONSTRAINT "PendingCheckout_basePhotoId_fkey" FOREIGN KEY ("basePhotoId") REFERENCES "ModelBasePhoto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingCheckout" ADD CONSTRAINT "PendingCheckout_compositeId_fkey" FOREIGN KEY ("compositeId") REFERENCES "GeneratedComposite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_pendingCheckoutId_fkey" FOREIGN KEY ("pendingCheckoutId") REFERENCES "PendingCheckout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_basePhotoId_fkey" FOREIGN KEY ("basePhotoId") REFERENCES "ModelBasePhoto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_compositeId_fkey" FOREIGN KEY ("compositeId") REFERENCES "GeneratedComposite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemPart" ADD CONSTRAINT "OrderItemPart_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemPart" ADD CONSTRAINT "OrderItemPart_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
