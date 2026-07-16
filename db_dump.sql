-- MySQL dump 10.13  Distrib 8.0.46, for Linux (x86_64)
--
-- Host: localhost    Database: forwarding_hub
-- ------------------------------------------------------
-- Server version	8.0.46

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `booking_messages`
--

DROP TABLE IF EXISTS `booking_messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `booking_messages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `booking_id` int NOT NULL,
  `sender_id` int DEFAULT NULL,
  `message` text NOT NULL,
  `is_private` tinyint(1) DEFAULT '0' COMMENT 'TRUE 이면 포워더 사내 메모 (화주에게는 노출 안됨)',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `booking_id` (`booking_id`),
  KEY `sender_id` (`sender_id`),
  CONSTRAINT `booking_messages_ibfk_1` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE CASCADE,
  CONSTRAINT `booking_messages_ibfk_2` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `booking_messages`
--

LOCK TABLES `booking_messages` WRITE;
/*!40000 ALTER TABLE `booking_messages` DISABLE KEYS */;
/*!40000 ALTER TABLE `booking_messages` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `bookings`
--

DROP TABLE IF EXISTS `bookings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bookings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `schedule_id` int DEFAULT NULL,
  `incoterms` varchar(50) DEFAULT NULL,
  `status` varchar(50) DEFAULT 'Pending',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `schedule_id` (`schedule_id`),
  CONSTRAINT `bookings_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `bookings_ibfk_2` FOREIGN KEY (`schedule_id`) REFERENCES `schedules` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bookings`
--

LOCK TABLES `bookings` WRITE;
/*!40000 ALTER TABLE `bookings` DISABLE KEYS */;
/*!40000 ALTER TABLE `bookings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `clients`
--

DROP TABLE IF EXISTS `clients`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `clients` (
  `client_id` varchar(50) NOT NULL,
  `client_name` varchar(100) NOT NULL,
  `margin_type` enum('PERCENTAGE','FIXED') NOT NULL DEFAULT 'PERCENTAGE',
  `ocean_margin_rate` decimal(5,2) NOT NULL DEFAULT '0.00',
  `local_margin_rate` decimal(5,2) NOT NULL DEFAULT '0.00',
  `fixed_margin_per_unit` decimal(10,2) NOT NULL DEFAULT '0.00',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`client_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `clients`
--

LOCK TABLES `clients` WRITE;
/*!40000 ALTER TABLE `clients` DISABLE KEYS */;
INSERT INTO `clients` VALUES ('DONG_A_TRADE','(주)대동자동차무역','PERCENTAGE',12.50,10.00,0.00,'2026-07-09 06:26:00','2026-07-09 06:26:00'),('SEOUL_AUTO','서울오토트레이딩','FIXED',0.00,0.00,150.00,'2026-07-09 06:26:00','2026-07-09 06:26:00');
/*!40000 ALTER TABLE `clients` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cost_rates`
--

DROP TABLE IF EXISTS `cost_rates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cost_rates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cargo_type` enum('SEDAN','SUV','TRUCK','BUS') NOT NULL,
  `ocean_cost_usd` decimal(10,2) NOT NULL,
  `lashing_cost_krw` decimal(15,0) NOT NULL,
  `thc_cost_krw` decimal(15,0) NOT NULL,
  `wharfage_cost_krw` decimal(15,0) NOT NULL,
  `bl_fee_krw` decimal(15,0) NOT NULL,
  `customs_cost_krw` decimal(15,0) NOT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cargo_type` (`cargo_type`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cost_rates`
--

LOCK TABLES `cost_rates` WRITE;
/*!40000 ALTER TABLE `cost_rates` DISABLE KEYS */;
INSERT INTO `cost_rates` VALUES (1,'SEDAN',1300.00,40000,25000,15000,40000,33000,1,'2026-07-09 06:26:00'),(2,'SUV',1600.00,40000,25000,15000,40000,33000,1,'2026-07-09 06:26:00'),(3,'TRUCK',1800.00,45000,30000,20000,40000,33000,1,'2026-07-09 06:26:00'),(4,'BUS',2500.00,60000,40000,25000,40000,33000,1,'2026-07-09 06:26:00');
/*!40000 ALTER TABLE `cost_rates` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `invoice_items`
--

DROP TABLE IF EXISTS `invoice_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `invoice_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `invoice_no` varchar(50) NOT NULL,
  `vin` varchar(17) NOT NULL,
  `model_name` varchar(50) NOT NULL,
  `cargo_type` enum('SEDAN','SUV','TRUCK','BUS') NOT NULL,
  `applied_ocean_usd` decimal(10,2) NOT NULL,
  `applied_lashing_krw` decimal(15,0) NOT NULL,
  `applied_thc_krw` decimal(15,0) NOT NULL,
  `applied_wharfage_krw` decimal(15,0) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `invoice_no` (`invoice_no`),
  CONSTRAINT `invoice_items_ibfk_1` FOREIGN KEY (`invoice_no`) REFERENCES `invoices` (`invoice_no`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `invoice_items`
--

LOCK TABLES `invoice_items` WRITE;
/*!40000 ALTER TABLE `invoice_items` DISABLE KEYS */;
INSERT INTO `invoice_items` VALUES (1,'INV-KMTC17365338','KMFXKS7BPYU442814','포터 (PORTER)','TRUCK',2025.00,49500,33000,22000);
/*!40000 ALTER TABLE `invoice_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `invoices`
--

DROP TABLE IF EXISTS `invoices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `invoices` (
  `invoice_no` varchar(50) NOT NULL,
  `client_id` varchar(50) NOT NULL,
  `bl_number` varchar(100) DEFAULT NULL,
  `vessel_name` varchar(100) NOT NULL,
  `pol` varchar(50) NOT NULL,
  `pod` varchar(50) NOT NULL,
  `exchange_rate` decimal(7,2) NOT NULL,
  `total_ocean_usd` decimal(13,2) NOT NULL,
  `total_local_krw` decimal(15,0) NOT NULL,
  `final_amount_krw` decimal(15,0) NOT NULL,
  `bl_fee_krw` decimal(15,0) NOT NULL DEFAULT '40000',
  `customs_fee_krw` decimal(15,0) NOT NULL DEFAULT '33000',
  `payment_status` enum('PENDING','PAID','OVERDUE') NOT NULL DEFAULT 'PENDING',
  `due_date` date NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`invoice_no`),
  KEY `client_id` (`client_id`),
  CONSTRAINT `invoices_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `clients` (`client_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `invoices`
--

LOCK TABLES `invoices` WRITE;
/*!40000 ALTER TABLE `invoices` DISABLE KEYS */;
/*!40000 ALTER TABLE `invoices` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `schedules`
--

DROP TABLE IF EXISTS `schedules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `schedules` (
  `id` int NOT NULL AUTO_INCREMENT,
  `vessel_name` varchar(100) DEFAULT NULL,
  `voyage` varchar(50) DEFAULT '',
  `line` varchar(100) DEFAULT '',
  `pol` varchar(100) DEFAULT NULL,
  `pod` varchar(100) DEFAULT NULL,
  `etd` date DEFAULT NULL,
  `eta` date DEFAULT NULL,
  `doc_closing_date` datetime DEFAULT NULL,
  `cargo_closing_date` datetime DEFAULT NULL,
  `vessel_imo` varchar(50) DEFAULT NULL COMMENT 'IMO 번호',
  `metadata` json DEFAULT NULL COMMENT '상세 마감 정보 등 JSON 데이터',
  `available_cbm` decimal(8,2) DEFAULT NULL COMMENT '선적 가능한 남은 부피',
  `available_weight` decimal(10,2) DEFAULT NULL COMMENT '선적 가능한 남은 무게(kg)',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `schedules`
--

LOCK TABLES `schedules` WRITE;
/*!40000 ALTER TABLE `schedules` DISABLE KEYS */;
INSERT INTO `schedules` VALUES (1,'MSC MILAN','GO626N','ORIENT SERVICE','KRPUS','USLGB','2026-07-11','2026-07-25','2026-06-30 03:00:00','2026-07-03 03:00:00','9964235','{\"cyCutOff\": \"2026-07-03T03:00:00.000Z\", \"siCutOff\": \"2026-06-30T03:00:00.000Z\", \"vgmCutOff\": \"2026-07-02T09:00:00.000Z\", \"reeferCutOff\": \"2026-07-04T15:00:00.000Z\", \"dangerousCutOff\": \"2026-06-30T03:00:00.000Z\", \"originalCarrier\": \"MSC\"}',150.00,25000.00,'2026-07-12 00:50:29'),(2,'MSC SAN FRANCISCO','GO627N','ORIENT SERVICE','KRPUS','USLGB','2026-07-19','2026-07-31','2026-07-07 03:00:00','2026-07-10 03:00:00','9987328','{\"cyCutOff\": \"2026-07-10T03:00:00.000Z\", \"siCutOff\": \"2026-07-07T03:00:00.000Z\", \"vgmCutOff\": \"2026-07-09T09:00:00.000Z\", \"reeferCutOff\": \"2026-07-11T15:00:00.000Z\", \"dangerousCutOff\": \"2026-07-07T03:00:00.000Z\", \"originalCarrier\": \"MSC\"}',150.00,25000.00,'2026-07-12 00:50:29'),(3,'MSC BIANCA SILVIA','GO628N','ORIENT SERVICE','KRPUS','USLGB','2026-07-21','2026-08-04','2026-07-14 03:00:00','2026-07-17 03:00:00','9930935','{\"cyCutOff\": \"2026-07-17T03:00:00.000Z\", \"siCutOff\": \"2026-07-14T03:00:00.000Z\", \"vgmCutOff\": \"2026-07-16T09:00:00.000Z\", \"reeferCutOff\": \"2026-07-18T15:00:00.000Z\", \"dangerousCutOff\": \"2026-07-14T03:00:00.000Z\", \"originalCarrier\": \"MSC\"}',150.00,25000.00,'2026-07-12 00:50:29'),(4,'MSC FAITH','GO629N','ORIENT SERVICE','KRPUS','USLGB','2026-07-27','2026-08-09','2026-07-21 03:00:00','2026-07-24 03:00:00','9842085','{\"cyCutOff\": \"2026-07-24T03:00:00.000Z\", \"siCutOff\": \"2026-07-21T03:00:00.000Z\", \"vgmCutOff\": \"2026-07-23T09:00:00.000Z\", \"reeferCutOff\": \"2026-07-25T15:00:00.000Z\", \"dangerousCutOff\": \"2026-07-21T03:00:00.000Z\", \"originalCarrier\": \"MSC\"}',150.00,25000.00,'2026-07-12 00:50:29'),(5,'MSC BARI','GO630N','ORIENT SERVICE','KRPUS','USLGB','2026-08-03','2026-08-16',NULL,NULL,'9461441','{\"cyCutOff\": null, \"siCutOff\": null, \"vgmCutOff\": null, \"reeferCutOff\": null, \"dangerousCutOff\": null, \"originalCarrier\": \"MSC\"}',150.00,25000.00,'2026-07-12 00:50:29'),(6,'MSC MARA','GO631N','ORIENT SERVICE','KRPUS','USLGB','2026-08-10','2026-08-23','2026-08-03 03:00:00','2026-08-06 03:00:00','9932892','{\"cyCutOff\": \"2026-08-06T03:00:00.000Z\", \"siCutOff\": \"2026-08-03T03:00:00.000Z\", \"vgmCutOff\": \"2026-08-05T09:00:00.000Z\", \"reeferCutOff\": \"2026-08-06T15:00:00.000Z\", \"dangerousCutOff\": \"2026-08-03T03:00:00.000Z\", \"originalCarrier\": \"MSC\"}',150.00,25000.00,'2026-07-12 00:50:29'),(7,'MSC BEATRICE','GO632N','ORIENT SERVICE','KRPUS','USLGB','2026-08-17','2026-08-30',NULL,NULL,'9399014','{\"cyCutOff\": null, \"siCutOff\": null, \"vgmCutOff\": null, \"reeferCutOff\": null, \"dangerousCutOff\": null, \"originalCarrier\": \"MSC\"}',150.00,25000.00,'2026-07-12 00:50:29'),(8,'MSC MILAN','GO633N','ORIENT SERVICE','KRPUS','USLGB','2026-08-24','2026-09-06','2026-08-18 03:00:00','2026-08-21 03:00:00','9964235','{\"cyCutOff\": \"2026-08-21T03:00:00.000Z\", \"siCutOff\": \"2026-08-18T03:00:00.000Z\", \"vgmCutOff\": \"2026-08-20T09:00:00.000Z\", \"reeferCutOff\": \"2026-08-22T15:00:00.000Z\", \"dangerousCutOff\": \"2026-08-18T03:00:00.000Z\", \"originalCarrier\": \"MSC\"}',150.00,25000.00,'2026-07-12 00:50:29'),(9,'MSC SAN FRANCISCO','GO634N','ORIENT SERVICE','KRPUS','USLGB','2026-08-31','2026-09-13','2026-08-25 03:00:00','2026-08-28 03:00:00','9987328','{\"cyCutOff\": \"2026-08-28T03:00:00.000Z\", \"siCutOff\": \"2026-08-25T03:00:00.000Z\", \"vgmCutOff\": \"2026-08-27T09:00:00.000Z\", \"reeferCutOff\": \"2026-08-29T15:00:00.000Z\", \"dangerousCutOff\": \"2026-08-25T03:00:00.000Z\", \"originalCarrier\": \"MSC\"}',150.00,25000.00,'2026-07-12 00:50:29'),(10,'MSC MILAN','GO626N','ORIENT SERVICE','KRPUS','USLGB','2026-07-13','2026-07-27','2026-06-30 03:00:00','2026-07-03 03:00:00','9964235','{\"cyCutOff\": \"2026-07-03T03:00:00.000Z\", \"siCutOff\": \"2026-06-30T03:00:00.000Z\", \"vgmCutOff\": \"2026-07-02T09:00:00.000Z\", \"reeferCutOff\": \"2026-07-04T15:00:00.000Z\", \"dangerousCutOff\": \"2026-06-30T03:00:00.000Z\", \"originalCarrier\": \"MSC\"}',150.00,25000.00,'2026-07-13 12:18:17'),(11,'MSC SAN FRANCISCO','GO627N','ORIENT SERVICE','KRPUS','USLGB','2026-07-21','2026-08-02','2026-07-07 03:00:00','2026-07-10 03:00:00','9987328','{\"cyCutOff\": \"2026-07-10T03:00:00.000Z\", \"siCutOff\": \"2026-07-07T03:00:00.000Z\", \"vgmCutOff\": \"2026-07-09T09:00:00.000Z\", \"reeferCutOff\": \"2026-07-11T15:00:00.000Z\", \"dangerousCutOff\": \"2026-07-07T03:00:00.000Z\", \"originalCarrier\": \"MSC\"}',150.00,25000.00,'2026-07-13 12:18:17'),(12,'MSC BIANCA SILVIA','GO628N','ORIENT SERVICE','KRPUS','USLGB','2026-07-23','2026-08-06','2026-07-14 03:00:00','2026-07-17 03:00:00','9930935','{\"cyCutOff\": \"2026-07-17T03:00:00.000Z\", \"siCutOff\": \"2026-07-14T03:00:00.000Z\", \"vgmCutOff\": \"2026-07-16T09:00:00.000Z\", \"reeferCutOff\": \"2026-07-18T15:00:00.000Z\", \"dangerousCutOff\": \"2026-07-14T03:00:00.000Z\", \"originalCarrier\": \"MSC\"}',150.00,25000.00,'2026-07-13 12:18:17'),(13,'MSC MARA','GO631N','ORIENT SERVICE','KRPUS','USLGB','2026-08-11','2026-08-23','2026-08-03 03:00:00','2026-08-06 03:00:00','9932892','{\"cyCutOff\": \"2026-08-06T03:00:00.000Z\", \"siCutOff\": \"2026-08-03T03:00:00.000Z\", \"vgmCutOff\": \"2026-08-05T09:00:00.000Z\", \"reeferCutOff\": \"2026-08-06T15:00:00.000Z\", \"dangerousCutOff\": \"2026-08-03T03:00:00.000Z\", \"originalCarrier\": \"MSC\"}',150.00,25000.00,'2026-07-13 12:18:17'),(14,'MSC BIANCA SILVIA','GO635N','ORIENT SERVICE','KRPUS','USLGB','2026-09-07','2026-09-20',NULL,NULL,'9930935','{\"cyCutOff\": null, \"siCutOff\": null, \"vgmCutOff\": null, \"reeferCutOff\": null, \"dangerousCutOff\": null, \"originalCarrier\": \"MSC\"}',150.00,25000.00,'2026-07-13 12:18:17'),(15,'MSC SAN FRANCISCO','GO627N','ORIENT SERVICE','KRPUS','USLGB','2026-07-22','2026-08-03',NULL,NULL,'9987328','{\"cyCutOff\": null, \"siCutOff\": null, \"vgmCutOff\": null, \"reeferCutOff\": null, \"dangerousCutOff\": null, \"originalCarrier\": \"MSC\"}',150.00,25000.00,'2026-07-15 11:55:36'),(16,'MSC BIANCA SILVIA','GO628N','ORIENT SERVICE','KRPUS','USLGB','2026-07-24','2026-08-07',NULL,NULL,'9930935','{\"cyCutOff\": null, \"siCutOff\": null, \"vgmCutOff\": null, \"reeferCutOff\": null, \"dangerousCutOff\": null, \"originalCarrier\": \"MSC\"}',150.00,25000.00,'2026-07-15 11:55:36'),(17,'MSC FAITH','GO629N','ORIENT SERVICE','KRPUS','USLGB','2026-07-29','2026-08-10',NULL,NULL,'9842085','{\"cyCutOff\": null, \"siCutOff\": null, \"vgmCutOff\": null, \"reeferCutOff\": null, \"dangerousCutOff\": null, \"originalCarrier\": \"MSC\"}',150.00,25000.00,'2026-07-15 11:55:36'),(18,'MSC MARA','GO631N','ORIENT SERVICE','KRPUS','USLGB','2026-08-12','2026-08-24',NULL,NULL,'9932892','{\"cyCutOff\": null, \"siCutOff\": null, \"vgmCutOff\": null, \"reeferCutOff\": null, \"dangerousCutOff\": null, \"originalCarrier\": \"MSC\"}',150.00,25000.00,'2026-07-15 11:55:36'),(19,'MSC MILAN','GO633N','ORIENT SERVICE','KRPUS','USLGB','2026-08-26','2026-09-07',NULL,NULL,'9964235','{\"cyCutOff\": null, \"siCutOff\": null, \"vgmCutOff\": null, \"reeferCutOff\": null, \"dangerousCutOff\": null, \"originalCarrier\": \"MSC\"}',150.00,25000.00,'2026-07-15 11:55:36'),(20,'MSC SAN FRANCISCO','GO634N','ORIENT SERVICE','KRPUS','USLGB','2026-09-01','2026-09-13',NULL,NULL,'9987328','{\"cyCutOff\": null, \"siCutOff\": null, \"vgmCutOff\": null, \"reeferCutOff\": null, \"dangerousCutOff\": null, \"originalCarrier\": \"MSC\"}',150.00,25000.00,'2026-07-15 11:55:36');
/*!40000 ALTER TABLE `schedules` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sessions`
--

DROP TABLE IF EXISTS `sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sessions` (
  `session_id` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `expires` int unsigned NOT NULL,
  `data` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  PRIMARY KEY (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sessions`
--

LOCK TABLES `sessions` WRITE;
/*!40000 ALTER TABLE `sessions` DISABLE KEYS */;
INSERT INTO `sessions` VALUES ('ZNcLBu29bbWwhWhpwoJb1GUBnIVOXldh',1784203197,'{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-07-16T11:59:51.269Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\"},\"user\":{\"id\":2,\"username\":\"shipper\",\"role\":\"client\",\"client_id\":\"DONG_A_TRADE\"}}'),('bLHf-IpRLsHg4Rc_FnOXAAjfNUV3W9HM',1784202910,'{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-07-16T11:55:10.256Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\"},\"user\":{\"id\":3,\"username\":\"김성현\",\"role\":\"admin\",\"client_id\":null,\"kakaoToken\":\"NLb9KfOg3aSsYOzD2H0jQ65y1UKoGRQ2AAAAAQoXFmIAAAGfZaF98CrXsvB0zxAC\"}}'),('efDpJ8KbhLapAqE2VfyA2SrVGDX2Scrg',1784202501,'{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-07-16T11:48:21.000Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\"},\"user\":{\"id\":2,\"username\":\"shipper\",\"role\":\"client\",\"client_id\":\"DONG_A_TRADE\"}}'),('fT78S4vV18p-6W_OZF2C7RMPckmCjb91',1784203186,'{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-07-16T11:59:42.255Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\"},\"user\":{\"id\":3,\"username\":\"김성현\",\"role\":\"admin\",\"client_id\":null,\"kakaoToken\":\"ekTpKP1Ipuymt679ABaQc_x82B7jMC1UAAAAAQoNDV8AAAGfZaWkXCrXsvB0zxAC\"}}'),('k_MrYrstN4zK4klel1EBLZZA3tA4vw65',1784202937,'{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-07-16T11:55:24.327Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\"},\"user\":{\"id\":2,\"username\":\"shipper\",\"role\":\"client\",\"client_id\":\"DONG_A_TRADE\"}}'),('xfOlveJ2aLd_FI4GmP9hL5BnBHMgjPEz',1784202560,'{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-07-16T11:49:11.789Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\"},\"user\":{\"id\":3,\"username\":\"김성현\",\"role\":\"admin\",\"client_id\":null,\"kakaoToken\":\"yWfMAWmDV4mUYr6QnBPKo8C2hc9CD_tAAAAAAQoNIFoAAAGfZZwFoCrXsvB0zxAC\"}}');
/*!40000 ALTER TABLE `sessions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `shipments`
--

DROP TABLE IF EXISTS `shipments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `shipments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `bl_number` varchar(100) NOT NULL,
  `booking_id` int DEFAULT NULL,
  `shipper` varchar(100) DEFAULT '일반 화주',
  `vessel_name` varchar(100) DEFAULT NULL,
  `status` varchar(50) DEFAULT 'Pending Documents',
  `pol` varchar(100) DEFAULT NULL,
  `pod` varchar(100) DEFAULT NULL,
  `etd` date DEFAULT NULL,
  `eta` date DEFAULT NULL,
  `doc_closing_date` datetime DEFAULT NULL,
  `cargo_closing_date` datetime DEFAULT NULL,
  `invoice_amount` decimal(10,2) DEFAULT NULL COMMENT '청구될 총액',
  `invoice_currency` varchar(10) DEFAULT 'USD',
  `is_paid` tinyint(1) DEFAULT '0' COMMENT '결제 여부',
  `invoice_file_path` varchar(255) DEFAULT NULL,
  `packing_list_file_path` varchar(255) DEFAULT NULL,
  `invoice_file_key` varchar(36) DEFAULT NULL,
  `packing_list_file_key` varchar(36) DEFAULT NULL,
  `invoice_approved` tinyint DEFAULT '0',
  `packing_approved` tinyint DEFAULT '0',
  `truck_date` date DEFAULT NULL,
  `truck_plate_number` varchar(50) DEFAULT NULL,
  `truck_driver_phone` varchar(20) DEFAULT NULL,
  `last_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `bl_number` (`bl_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `shipments`
--

LOCK TABLES `shipments` WRITE;
/*!40000 ALTER TABLE `shipments` DISABLE KEYS */;
/*!40000 ALTER TABLE `shipments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `shipper_mappings`
--

DROP TABLE IF EXISTS `shipper_mappings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `shipper_mappings` (
  `shipper_name` varchar(100) NOT NULL,
  `mapping_json` json NOT NULL,
  `last_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`shipper_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `shipper_mappings`
--

LOCK TABLES `shipper_mappings` WRITE;
/*!40000 ALTER TABLE `shipper_mappings` DISABLE KEYS */;
/*!40000 ALTER TABLE `shipper_mappings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `temp_file_grids`
--

DROP TABLE IF EXISTS `temp_file_grids`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `temp_file_grids` (
  `id` varchar(36) NOT NULL COMMENT 'UUID v4 key',
  `file_name` varchar(255) NOT NULL COMMENT 'Original file name',
  `file_type` varchar(50) NOT NULL COMMENT 'File type or extension',
  `grid_data` json NOT NULL COMMENT 'Parsed grid data in JSON format',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created timestamp',
  PRIMARY KEY (`id`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Temporary table for storing parsed Excel/PDF grid data';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `temp_file_grids`
--

LOCK TABLES `temp_file_grids` WRITE;
/*!40000 ALTER TABLE `temp_file_grids` DISABLE KEYS */;
/*!40000 ALTER TABLE `temp_file_grids` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('admin','client') DEFAULT 'client',
  `mobile` varchar(20) DEFAULT NULL,
  `client_id` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  KEY `client_id` (`client_id`),
  CONSTRAINT `users_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `clients` (`client_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'admin','admin123','admin','010-0000-0000',NULL,'2026-07-09 06:26:00'),(2,'shipper','shipper123','client','010-1111-1111','DONG_A_TRADE','2026-07-09 06:26:00'),(3,'김성현','kakao_oauth','admin','',NULL,'2026-07-09 23:27:16');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `vehicles`
--

DROP TABLE IF EXISTS `vehicles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `vehicles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `shipment_id` int NOT NULL,
  `vin` varchar(50) NOT NULL COMMENT '차대번호',
  `plate_number` varchar(50) DEFAULT NULL COMMENT '자동차등록번호',
  `vehicle_type` varchar(50) DEFAULT NULL COMMENT '차종',
  `mileage` varchar(50) DEFAULT NULL COMMENT '주행거리(km)',
  `initial_registration_date` date DEFAULT NULL COMMENT '최초등록일',
  `make` varchar(50) DEFAULT NULL COMMENT '제조사',
  `model` varchar(50) DEFAULT NULL COMMENT '모델명',
  `year` int DEFAULT NULL COMMENT '연식',
  `price` decimal(10,2) DEFAULT NULL COMMENT 'ì°¨ëŸ‰ ë‹¨ê°€',
  `length` int DEFAULT NULL COMMENT '전장(mm)',
  `width` int DEFAULT NULL COMMENT '전폭(mm)',
  `height` int DEFAULT NULL COMMENT '전고(mm)',
  `weight` decimal(8,2) DEFAULT NULL COMMENT '차량 중량',
  `cbm` decimal(8,2) DEFAULT NULL COMMENT '부피(CBM)',
  `drivability` enum('Running','Towing','Forklift') DEFAULT NULL COMMENT '구동/선적 상태',
  `status` varchar(50) DEFAULT 'Pending' COMMENT '야드 반입, 선적 등 현재 상태',
  `condition_photo_url` text COMMENT '상태/데미지 리포트 사진 경로 (JSON 배열)',
  `deregistration_photo_url` text COMMENT '말소증 사진 경로 (JSON 배열)',
  `vin_photo_url` text COMMENT '차대번호 사진 경로 (JSON 배열)',
  `deregistration_no` varchar(100) DEFAULT NULL COMMENT '수출말소등록번호',
  `customs_cleared` tinyint(1) DEFAULT '0' COMMENT '수출통관 완료 여부',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `last_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `shipment_id` (`shipment_id`),
  CONSTRAINT `vehicles_ibfk_1` FOREIGN KEY (`shipment_id`) REFERENCES `shipments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `vehicles`
--

LOCK TABLES `vehicles` WRITE;
/*!40000 ALTER TABLE `vehicles` DISABLE KEYS */;
/*!40000 ALTER TABLE `vehicles` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-16 11:47:56
