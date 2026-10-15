-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Hôte : 127.0.0.1
-- Généré le : ven. 09 oct. 2026 à 09:47
-- Version du serveur : 10.4.32-MariaDB
-- Version de PHP : 8.0.30

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de données : `mat_manage`
--

-- --------------------------------------------------------

-- 1. Créer la base de données
CREATE DATABASE IF NOT EXISTS mat_manage CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. Sélectionner la base de données
USE mat_manage;

--
-- Structure de la table `allocations`
--

CREATE TABLE `allocations` (
  `allocation_id` bigint(20) UNSIGNED NOT NULL,
  `allocation_number` varchar(50) NOT NULL,
  `stock_movement_id` bigint(20) UNSIGNED NOT NULL,
  `service_id` bigint(20) UNSIGNED NOT NULL,
  `recipient_name` varchar(150) NOT NULL,
  `allocated_by` bigint(20) UNSIGNED NOT NULL,
  `allocation_date` datetime NOT NULL DEFAULT current_timestamp(),
  `receipt_reference` varchar(100) DEFAULT NULL,
  `notes` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `allocation_lines`
--

CREATE TABLE `allocation_lines` (
  `allocation_line_id` bigint(20) UNSIGNED NOT NULL,
  `allocation_id` bigint(20) UNSIGNED NOT NULL,
  `stock_movement_line_id` bigint(20) UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `audit_logs`
--

CREATE TABLE `audit_logs` (
  `audit_log_id` bigint(20) UNSIGNED NOT NULL,
  `user_id` bigint(20) UNSIGNED DEFAULT NULL,
  `action_code` varchar(80) NOT NULL,
  `entity_name` varchar(80) NOT NULL,
  `entity_id` bigint(20) UNSIGNED DEFAULT NULL,
  `occurred_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `ip_address` varbinary(16) DEFAULT NULL,
  `details` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`details`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `categories`
--

CREATE TABLE `categories` (
  `category_id` bigint(20) UNSIGNED NOT NULL,
  `parent_category_id` bigint(20) UNSIGNED DEFAULT NULL,
  `parent_key` bigint(20) UNSIGNED GENERATED ALWAYS AS (coalesce(`parent_category_id`,0)) STORED,
  `category_name` varchar(100) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `locations`
--

CREATE TABLE `locations` (
  `location_id` bigint(20) UNSIGNED NOT NULL,
  `parent_location_id` bigint(20) UNSIGNED DEFAULT NULL,
  `location_code` varchar(40) NOT NULL,
  `location_name` varchar(120) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `maintenance_sessions`
--

CREATE TABLE `maintenance_sessions` (
  `maintenance_id` bigint(20) UNSIGNED NOT NULL,
  `maintenance_number` varchar(50) NOT NULL,
  `material_id` bigint(20) UNSIGNED NOT NULL,
  `asset_id` bigint(20) UNSIGNED DEFAULT NULL,
  `service_id` bigint(20) UNSIGNED DEFAULT NULL,
  `reported_by` bigint(20) UNSIGNED NOT NULL,
  `technician_id` bigint(20) UNSIGNED DEFAULT NULL,
  `maintenance_type` enum('PREVENTIVE','REPAIR','DIAGNOSTIC','INSTALLATION','OTHER') NOT NULL,
  `status` enum('PLANNED','IN_PROGRESS','COMPLETED','CANCELLED') NOT NULL DEFAULT 'PLANNED',
  `scheduled_at` datetime NOT NULL,
  `started_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `duration_minutes` int(10) UNSIGNED DEFAULT NULL,
  `problem_description` text DEFAULT NULL,
  `actions_taken` text DEFAULT NULL,
  `parts_cost` decimal(14,2) NOT NULL DEFAULT 0.00,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ;

-- --------------------------------------------------------

--
-- Structure de la table `materials`
--

CREATE TABLE `materials` (
  `material_id` bigint(20) UNSIGNED NOT NULL,
  `material_code` varchar(50) NOT NULL,
  `designation` varchar(180) NOT NULL,
  `category_id` bigint(20) UNSIGNED NOT NULL,
  `brand` varchar(100) DEFAULT NULL,
  `model` varchar(120) DEFAULT NULL,
  `unit` varchar(30) NOT NULL DEFAULT 'unité',
  `tracks_serial` tinyint(1) NOT NULL DEFAULT 0,
  `minimum_stock` decimal(12,2) NOT NULL DEFAULT 0.00,
  `description` text DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ;

-- --------------------------------------------------------

--
-- Structure de la table `material_assets`
--

CREATE TABLE `material_assets` (
  `asset_id` bigint(20) UNSIGNED NOT NULL,
  `material_id` bigint(20) UNSIGNED NOT NULL,
  `serial_number` varchar(120) NOT NULL,
  `asset_tag` varchar(80) DEFAULT NULL,
  `asset_status` enum('IN_STOCK','ASSIGNED','IN_MAINTENANCE','RETIRED','LOST') NOT NULL DEFAULT 'IN_STOCK',
  `location_id` bigint(20) UNSIGNED DEFAULT NULL,
  `service_id` bigint(20) UNSIGNED DEFAULT NULL,
  `notes` varchar(500) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `password_resets`
--

CREATE TABLE `password_resets` (
  `id` int(11) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `email` varchar(191) NOT NULL,
  `otp_code` varchar(6) NOT NULL,
  `expires_at` datetime NOT NULL,
  `is_used` tinyint(1) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `permissions`
--

CREATE TABLE `permissions` (
  `permission_id` bigint(20) UNSIGNED NOT NULL,
  `permission_code` varchar(80) NOT NULL,
  `description` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

--
-- Déchargement des données de la table `permissions`
--

INSERT INTO `permissions` (`permission_id`, `permission_code`, `description`) VALUES
(1, 'USERS_MANAGE', 'Créer et gérer les comptes utilisateurs et leurs rôles'),
(2, 'MATERIALS_READ', 'Consulter le catalogue et les quantités en stock'),
(3, 'MATERIALS_MANAGE', 'Créer et modifier les fiches matériel et les référentiels'),
(4, 'STOCK_MOVE', 'Enregistrer les entrées, sorties et transferts de stock'),
(5, 'ALLOCATIONS_MANAGE', 'Créer et consulter les dotations aux services'),
(6, 'MAINTENANCE_MANAGE', 'Créer, modifier et clôturer les maintenances'),
(7, 'SUPPLIERS_MANAGE', 'Gérer les fournisseurs'),
(8, 'PURCHASING_MANAGE', 'Gérer les demandes de prix et commandes'),
(9, 'REPORTS_READ', 'Consulter et exporter les rapports');

-- --------------------------------------------------------

--
-- Structure de la table `purchase_orders`
--

CREATE TABLE `purchase_orders` (
  `purchase_order_id` bigint(20) UNSIGNED NOT NULL,
  `order_number` varchar(50) NOT NULL,
  `supplier_id` bigint(20) UNSIGNED NOT NULL,
  `supplier_quote_id` bigint(20) UNSIGNED DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `order_date` date NOT NULL,
  `expected_date` date DEFAULT NULL,
  `status` enum('DRAFT','SENT','CONFIRMED','PARTIALLY_RECEIVED','RECEIVED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `currency_code` char(3) NOT NULL DEFAULT 'XAF',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `purchase_order_lines`
--

CREATE TABLE `purchase_order_lines` (
  `purchase_order_line_id` bigint(20) UNSIGNED NOT NULL,
  `purchase_order_id` bigint(20) UNSIGNED NOT NULL,
  `material_id` bigint(20) UNSIGNED NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `quantity` decimal(12,2) NOT NULL,
  `unit_price` decimal(14,2) NOT NULL,
  `tax_rate` decimal(5,2) NOT NULL DEFAULT 0.00,
  `received_quantity` decimal(12,2) NOT NULL DEFAULT 0.00
) ;

-- --------------------------------------------------------

--
-- Structure de la table `quote_requests`
--

CREATE TABLE `quote_requests` (
  `quote_request_id` bigint(20) UNSIGNED NOT NULL,
  `request_number` varchar(50) NOT NULL,
  `requested_by` bigint(20) UNSIGNED NOT NULL,
  `request_date` datetime NOT NULL DEFAULT current_timestamp(),
  `required_by` date DEFAULT NULL,
  `status` enum('DRAFT','SENT','PARTIALLY_ANSWERED','ANSWERED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `quote_request_lines`
--

CREATE TABLE `quote_request_lines` (
  `quote_request_line_id` bigint(20) UNSIGNED NOT NULL,
  `quote_request_id` bigint(20) UNSIGNED NOT NULL,
  `material_id` bigint(20) UNSIGNED NOT NULL,
  `requested_quantity` decimal(12,2) NOT NULL,
  `notes` varchar(500) DEFAULT NULL
) ;

-- --------------------------------------------------------

--
-- Structure de la table `quote_request_suppliers`
--

CREATE TABLE `quote_request_suppliers` (
  `quote_request_id` bigint(20) UNSIGNED NOT NULL,
  `supplier_id` bigint(20) UNSIGNED NOT NULL,
  `sent_at` datetime DEFAULT NULL,
  `response_status` enum('PENDING','RECEIVED','DECLINED','EXPIRED') NOT NULL DEFAULT 'PENDING'
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `roles`
--

CREATE TABLE `roles` (
  `role_id` bigint(20) UNSIGNED NOT NULL,
  `role_code` varchar(40) NOT NULL,
  `role_name` varchar(80) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

--
-- Déchargement des données de la table `roles`
--

INSERT INTO `roles` (`role_id`, `role_code`, `role_name`, `description`, `created_at`) VALUES
(1, 'ADMIN', 'Administrateur', 'Administration des comptes, rôles et référentiels', '2026-10-09 07:46:23'),
(3, 'STOREKEEPER', 'Magasinier', 'Inventaire, emplacements et mouvements de stock', '2026-10-09 07:46:23'),
(4, 'MAINTAINER', 'Maintenancier', 'Planification et suivi des maintenances', '2026-10-09 07:46:23');

-- --------------------------------------------------------

--
-- Structure de la table `role_permissions`
--

CREATE TABLE `role_permissions` (
  `role_id` bigint(20) UNSIGNED NOT NULL,
  `permission_id` bigint(20) UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

--
-- Déchargement des données de la table `role_permissions`
--

INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES
(1, 1),
(1, 2),
(1, 3),
(1, 4),
(1, 5),
(1, 6),
(1, 7),
(1, 8),
(1, 9),
(3, 2),
(3, 3),
(3, 4),
(3, 9),
(4, 2),
(4, 6),
(4, 9);

-- --------------------------------------------------------

--
-- Structure de la table `services`
--

CREATE TABLE `services` (
  `service_id` bigint(20) UNSIGNED NOT NULL,
  `service_code` varchar(40) NOT NULL,
  `service_name` varchar(120) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `stock_balances`
--

CREATE TABLE `stock_balances` (
  `material_id` bigint(20) UNSIGNED NOT NULL,
  `location_id` bigint(20) UNSIGNED NOT NULL,
  `quantity` decimal(12,2) NOT NULL DEFAULT 0.00,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ;

-- --------------------------------------------------------

--
-- Structure de la table `stock_movements`
--

CREATE TABLE `stock_movements` (
  `stock_movement_id` bigint(20) UNSIGNED NOT NULL,
  `movement_number` varchar(50) NOT NULL,
  `movement_type` enum('IN','OUT','TRANSFER') NOT NULL,
  `movement_date` datetime NOT NULL DEFAULT current_timestamp(),
  `source_location_id` bigint(20) UNSIGNED DEFAULT NULL,
  `destination_location_id` bigint(20) UNSIGNED DEFAULT NULL,
  `service_id` bigint(20) UNSIGNED DEFAULT NULL COMMENT 'Service destinataire éventuel (dotation)',
  `supplier_id` bigint(20) UNSIGNED DEFAULT NULL,
  `purchase_order_id` bigint(20) UNSIGNED DEFAULT NULL,
  `performed_by` bigint(20) UNSIGNED NOT NULL,
  `recipient_name` varchar(150) DEFAULT NULL,
  `document_reference` varchar(100) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ;

-- --------------------------------------------------------

--
-- Structure de la table `stock_movement_lines`
--

CREATE TABLE `stock_movement_lines` (
  `stock_movement_line_id` bigint(20) UNSIGNED NOT NULL,
  `stock_movement_id` bigint(20) UNSIGNED NOT NULL,
  `material_id` bigint(20) UNSIGNED NOT NULL,
  `quantity` decimal(12,2) NOT NULL,
  `unit_cost` decimal(14,2) DEFAULT NULL
) ;

--
-- Déclencheurs `stock_movement_lines`
--
DELIMITER $$
CREATE TRIGGER `trg_stock_movement_line_after_insert` AFTER INSERT ON `stock_movement_lines` FOR EACH ROW BEGIN
  DECLARE v_type VARCHAR(10);
  DECLARE v_source BIGINT UNSIGNED;
  DECLARE v_destination BIGINT UNSIGNED;

  SELECT movement_type, source_location_id, destination_location_id
    INTO v_type, v_source, v_destination
    FROM stock_movements
   WHERE stock_movement_id = NEW.stock_movement_id;

  IF v_type IN ('OUT', 'TRANSFER') THEN
    UPDATE stock_balances
       SET quantity = quantity - NEW.quantity
     WHERE material_id = NEW.material_id AND location_id = v_source;
  END IF;

  IF v_type IN ('IN', 'TRANSFER') THEN
    INSERT INTO stock_balances (material_id, location_id, quantity)
    VALUES (NEW.material_id, v_destination, NEW.quantity)
    ON DUPLICATE KEY UPDATE quantity = quantity + NEW.quantity;
  END IF;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `trg_stock_movement_line_before_insert` BEFORE INSERT ON `stock_movement_lines` FOR EACH ROW BEGIN
  DECLARE v_type VARCHAR(10);
  DECLARE v_source BIGINT UNSIGNED;
  DECLARE v_qty DECIMAL(12,2) DEFAULT 0;

  SELECT movement_type, source_location_id
    INTO v_type, v_source
    FROM stock_movements
   WHERE stock_movement_id = NEW.stock_movement_id;

  IF v_type IN ('OUT', 'TRANSFER') THEN
    SELECT COALESCE(quantity, 0)
      INTO v_qty
      FROM stock_balances
     WHERE material_id = NEW.material_id AND location_id = v_source
     FOR UPDATE;

    IF v_qty < NEW.quantity THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Stock insuffisant pour ce mouvement';
    END IF;
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Structure de la table `suppliers`
--

CREATE TABLE `suppliers` (
  `supplier_id` bigint(20) UNSIGNED NOT NULL,
  `supplier_name` varchar(160) NOT NULL,
  `contact_name` varchar(120) DEFAULT NULL,
  `email` varchar(254) DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `address` varchar(255) DEFAULT NULL,
  `specialty` varchar(120) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `supplier_quotes`
--

CREATE TABLE `supplier_quotes` (
  `supplier_quote_id` bigint(20) UNSIGNED NOT NULL,
  `quote_request_id` bigint(20) UNSIGNED NOT NULL,
  `supplier_id` bigint(20) UNSIGNED NOT NULL,
  `quote_number` varchar(80) DEFAULT NULL,
  `received_at` datetime NOT NULL DEFAULT current_timestamp(),
  `valid_until` date DEFAULT NULL,
  `status` enum('RECEIVED','SELECTED','REJECTED','EXPIRED') NOT NULL DEFAULT 'RECEIVED',
  `notes` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `supplier_quote_lines`
--

CREATE TABLE `supplier_quote_lines` (
  `supplier_quote_line_id` bigint(20) UNSIGNED NOT NULL,
  `supplier_quote_id` bigint(20) UNSIGNED NOT NULL,
  `quote_request_line_id` bigint(20) UNSIGNED NOT NULL,
  `unit_price` decimal(14,2) NOT NULL,
  `quoted_quantity` decimal(12,2) NOT NULL,
  `tax_rate` decimal(5,2) NOT NULL DEFAULT 0.00,
  `delivery_days` smallint(5) UNSIGNED DEFAULT NULL
) ;

-- --------------------------------------------------------

--
-- Structure de la table `users`
--

CREATE TABLE `users` (
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `badge` varchar(40) NOT NULL,
  `full_name` varchar(150) NOT NULL,
  `email` varchar(254) DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `password_hash` varchar(255) NOT NULL COMMENT 'Hash sécurisé généré côté serveur, jamais le mot de passe en clair',
  `role_id` bigint(20) UNSIGNED NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `last_login_at` datetime DEFAULT NULL,
  `two_factor_code` varchar(255) DEFAULT NULL,
  `avatar_url` text DEFAULT NULL,
  `two_factor_expires` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

--
-- Index pour les tables déchargées
--

--
-- Index pour la table `allocations`
--
ALTER TABLE `allocations`
  ADD PRIMARY KEY (`allocation_id`),
  ADD UNIQUE KEY `uq_allocation_number` (`allocation_number`),
  ADD UNIQUE KEY `uq_allocation_movement` (`stock_movement_id`),
  ADD KEY `fk_alloc_service` (`service_id`),
  ADD KEY `fk_alloc_user` (`allocated_by`);

--
-- Index pour la table `allocation_lines`
--
ALTER TABLE `allocation_lines`
  ADD PRIMARY KEY (`allocation_line_id`),
  ADD UNIQUE KEY `uq_allocation_movement_line` (`stock_movement_line_id`),
  ADD KEY `fk_al_allocation` (`allocation_id`);

--
-- Index pour la table `audit_logs`
--
ALTER TABLE `audit_logs`
  ADD PRIMARY KEY (`audit_log_id`),
  ADD KEY `ix_audit_user_date` (`user_id`,`occurred_at`),
  ADD KEY `ix_audit_entity` (`entity_name`,`entity_id`);

--
-- Index pour la table `categories`
--
ALTER TABLE `categories`
  ADD PRIMARY KEY (`category_id`),
  ADD UNIQUE KEY `uq_categories_name_parent` (`category_name`,`parent_key`),
  ADD KEY `fk_categories_parent` (`parent_category_id`);

--
-- Index pour la table `locations`
--
ALTER TABLE `locations`
  ADD PRIMARY KEY (`location_id`),
  ADD UNIQUE KEY `uq_locations_code` (`location_code`),
  ADD KEY `fk_locations_parent` (`parent_location_id`);

--
-- Index pour la table `maintenance_sessions`
--
ALTER TABLE `maintenance_sessions`
  ADD PRIMARY KEY (`maintenance_id`),
  ADD UNIQUE KEY `uq_maintenance_number` (`maintenance_number`),
  ADD KEY `ix_maintenance_status_date` (`status`,`scheduled_at`),
  ADD KEY `ix_maintenance_material` (`material_id`),
  ADD KEY `fk_maint_asset` (`asset_id`),
  ADD KEY `fk_maint_service` (`service_id`),
  ADD KEY `fk_maint_reporter` (`reported_by`),
  ADD KEY `fk_maint_technician` (`technician_id`);

--
-- Index pour la table `materials`
--
ALTER TABLE `materials`
  ADD PRIMARY KEY (`material_id`),
  ADD UNIQUE KEY `uq_materials_code` (`material_code`),
  ADD KEY `ix_materials_category` (`category_id`),
  ADD KEY `ix_materials_designation` (`designation`),
  ADD KEY `fk_materials_created_by` (`created_by`);

--
-- Index pour la table `material_assets`
--
ALTER TABLE `material_assets`
  ADD PRIMARY KEY (`asset_id`),
  ADD UNIQUE KEY `uq_assets_serial` (`serial_number`),
  ADD UNIQUE KEY `uq_assets_tag` (`asset_tag`),
  ADD KEY `ix_assets_material_status` (`material_id`,`asset_status`),
  ADD KEY `fk_assets_location` (`location_id`),
  ADD KEY `fk_assets_service` (`service_id`);

--
-- Index pour la table `password_resets`
--
ALTER TABLE `password_resets`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_email_otp` (`email`,`otp_code`),
  ADD KEY `user_id` (`user_id`);

--
-- Index pour la table `permissions`
--
ALTER TABLE `permissions`
  ADD PRIMARY KEY (`permission_id`),
  ADD UNIQUE KEY `uq_permissions_code` (`permission_code`);

--
-- Index pour la table `purchase_orders`
--
ALTER TABLE `purchase_orders`
  ADD PRIMARY KEY (`purchase_order_id`),
  ADD UNIQUE KEY `uq_purchase_orders_number` (`order_number`),
  ADD KEY `ix_purchase_orders_supplier_status` (`supplier_id`,`status`),
  ADD KEY `fk_po_quote` (`supplier_quote_id`),
  ADD KEY `fk_po_created_by` (`created_by`);

--
-- Index pour la table `purchase_order_lines`
--
ALTER TABLE `purchase_order_lines`
  ADD PRIMARY KEY (`purchase_order_line_id`),
  ADD KEY `ix_pol_material` (`material_id`),
  ADD KEY `fk_pol_order` (`purchase_order_id`);

--
-- Index pour la table `quote_requests`
--
ALTER TABLE `quote_requests`
  ADD PRIMARY KEY (`quote_request_id`),
  ADD UNIQUE KEY `uq_quote_requests_number` (`request_number`),
  ADD KEY `ix_quote_requests_status_date` (`status`,`request_date`),
  ADD KEY `fk_quote_requests_user` (`requested_by`);

--
-- Index pour la table `quote_request_lines`
--
ALTER TABLE `quote_request_lines`
  ADD PRIMARY KEY (`quote_request_line_id`),
  ADD UNIQUE KEY `uq_quote_request_material` (`quote_request_id`,`material_id`),
  ADD KEY `fk_qrl_material` (`material_id`);

--
-- Index pour la table `quote_request_suppliers`
--
ALTER TABLE `quote_request_suppliers`
  ADD PRIMARY KEY (`quote_request_id`,`supplier_id`),
  ADD KEY `fk_qrs_supplier` (`supplier_id`);

--
-- Index pour la table `roles`
--
ALTER TABLE `roles`
  ADD PRIMARY KEY (`role_id`),
  ADD UNIQUE KEY `uq_roles_code` (`role_code`),
  ADD UNIQUE KEY `uq_roles_name` (`role_name`);

--
-- Index pour la table `role_permissions`
--
ALTER TABLE `role_permissions`
  ADD PRIMARY KEY (`role_id`,`permission_id`),
  ADD KEY `fk_role_permissions_permission` (`permission_id`);

--
-- Index pour la table `services`
--
ALTER TABLE `services`
  ADD PRIMARY KEY (`service_id`),
  ADD UNIQUE KEY `uq_services_code` (`service_code`),
  ADD UNIQUE KEY `uq_services_name` (`service_name`);

--
-- Index pour la table `stock_balances`
--
ALTER TABLE `stock_balances`
  ADD PRIMARY KEY (`material_id`,`location_id`),
  ADD KEY `ix_stock_location` (`location_id`);

--
-- Index pour la table `stock_movements`
--
ALTER TABLE `stock_movements`
  ADD PRIMARY KEY (`stock_movement_id`),
  ADD UNIQUE KEY `uq_stock_movements_number` (`movement_number`),
  ADD KEY `ix_stock_movements_date_type` (`movement_date`,`movement_type`),
  ADD KEY `ix_stock_movements_service` (`service_id`),
  ADD KEY `fk_sm_source` (`source_location_id`),
  ADD KEY `fk_sm_destination` (`destination_location_id`),
  ADD KEY `fk_sm_supplier` (`supplier_id`),
  ADD KEY `fk_sm_order` (`purchase_order_id`),
  ADD KEY `fk_sm_user` (`performed_by`);

--
-- Index pour la table `stock_movement_lines`
--
ALTER TABLE `stock_movement_lines`
  ADD PRIMARY KEY (`stock_movement_line_id`),
  ADD UNIQUE KEY `uq_movement_material` (`stock_movement_id`,`material_id`),
  ADD KEY `ix_sml_material` (`material_id`);

--
-- Index pour la table `suppliers`
--
ALTER TABLE `suppliers`
  ADD PRIMARY KEY (`supplier_id`),
  ADD UNIQUE KEY `uq_suppliers_name` (`supplier_name`),
  ADD KEY `ix_suppliers_active` (`is_active`);

--
-- Index pour la table `supplier_quotes`
--
ALTER TABLE `supplier_quotes`
  ADD PRIMARY KEY (`supplier_quote_id`),
  ADD UNIQUE KEY `uq_supplier_quote` (`quote_request_id`,`supplier_id`),
  ADD KEY `ix_supplier_quotes_status` (`status`);

--
-- Index pour la table `supplier_quote_lines`
--
ALTER TABLE `supplier_quote_lines`
  ADD PRIMARY KEY (`supplier_quote_line_id`),
  ADD UNIQUE KEY `uq_quote_line` (`supplier_quote_id`,`quote_request_line_id`),
  ADD KEY `fk_sql_request_line` (`quote_request_line_id`);

--
-- Index pour la table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`user_id`),
  ADD UNIQUE KEY `uq_users_matricule` (`badge`),
  ADD UNIQUE KEY `uq_users_email` (`email`),
  ADD KEY `ix_users_role` (`role_id`);

--
-- AUTO_INCREMENT pour les tables déchargées
--

--
-- AUTO_INCREMENT pour la table `allocations`
--
ALTER TABLE `allocations`
  MODIFY `allocation_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `allocation_lines`
--
ALTER TABLE `allocation_lines`
  MODIFY `allocation_line_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `audit_logs`
--
ALTER TABLE `audit_logs`
  MODIFY `audit_log_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `categories`
--
ALTER TABLE `categories`
  MODIFY `category_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `locations`
--
ALTER TABLE `locations`
  MODIFY `location_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `maintenance_sessions`
--
ALTER TABLE `maintenance_sessions`
  MODIFY `maintenance_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `materials`
--
ALTER TABLE `materials`
  MODIFY `material_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `material_assets`
--
ALTER TABLE `material_assets`
  MODIFY `asset_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `permissions`
--
ALTER TABLE `permissions`
  MODIFY `permission_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- AUTO_INCREMENT pour la table `purchase_orders`
--
ALTER TABLE `purchase_orders`
  MODIFY `purchase_order_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `purchase_order_lines`
--
ALTER TABLE `purchase_order_lines`
  MODIFY `purchase_order_line_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `quote_requests`
--
ALTER TABLE `quote_requests`
  MODIFY `quote_request_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `quote_request_lines`
--
ALTER TABLE `quote_request_lines`
  MODIFY `quote_request_line_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `roles`
--
ALTER TABLE `roles`
  MODIFY `role_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT pour la table `services`
--
ALTER TABLE `services`
  MODIFY `service_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `stock_movements`
--
ALTER TABLE `stock_movements`
  MODIFY `stock_movement_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `stock_movement_lines`
--
ALTER TABLE `stock_movement_lines`
  MODIFY `stock_movement_line_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `suppliers`
--
ALTER TABLE `suppliers`
  MODIFY `supplier_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `supplier_quotes`
--
ALTER TABLE `supplier_quotes`
  MODIFY `supplier_quote_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `supplier_quote_lines`
--
ALTER TABLE `supplier_quote_lines`
  MODIFY `supplier_quote_line_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `users`
--
ALTER TABLE `users`
  MODIFY `user_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- Contraintes pour les tables déchargées
--

--
-- Contraintes pour la table `allocations`
--
ALTER TABLE `allocations`
  ADD CONSTRAINT `fk_alloc_movement` FOREIGN KEY (`stock_movement_id`) REFERENCES `stock_movements` (`stock_movement_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_alloc_service` FOREIGN KEY (`service_id`) REFERENCES `services` (`service_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_alloc_user` FOREIGN KEY (`allocated_by`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE;

--
-- Contraintes pour la table `allocation_lines`
--
ALTER TABLE `allocation_lines`
  ADD CONSTRAINT `fk_al_allocation` FOREIGN KEY (`allocation_id`) REFERENCES `allocations` (`allocation_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_al_movement_line` FOREIGN KEY (`stock_movement_line_id`) REFERENCES `stock_movement_lines` (`stock_movement_line_id`) ON UPDATE CASCADE;

--
-- Contraintes pour la table `audit_logs`
--
ALTER TABLE `audit_logs`
  ADD CONSTRAINT `fk_audit_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Contraintes pour la table `categories`
--
ALTER TABLE `categories`
  ADD CONSTRAINT `fk_categories_parent` FOREIGN KEY (`parent_category_id`) REFERENCES `categories` (`category_id`) ON UPDATE CASCADE;

--
-- Contraintes pour la table `locations`
--
ALTER TABLE `locations`
  ADD CONSTRAINT `fk_locations_parent` FOREIGN KEY (`parent_location_id`) REFERENCES `locations` (`location_id`) ON UPDATE CASCADE;

--
-- Contraintes pour la table `maintenance_sessions`
--
ALTER TABLE `maintenance_sessions`
  ADD CONSTRAINT `fk_maint_asset` FOREIGN KEY (`asset_id`) REFERENCES `material_assets` (`asset_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_maint_material` FOREIGN KEY (`material_id`) REFERENCES `materials` (`material_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_maint_reporter` FOREIGN KEY (`reported_by`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_maint_service` FOREIGN KEY (`service_id`) REFERENCES `services` (`service_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_maint_technician` FOREIGN KEY (`technician_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Contraintes pour la table `materials`
--
ALTER TABLE `materials`
  ADD CONSTRAINT `fk_materials_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`category_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_materials_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Contraintes pour la table `material_assets`
--
ALTER TABLE `material_assets`
  ADD CONSTRAINT `fk_assets_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`location_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_assets_material` FOREIGN KEY (`material_id`) REFERENCES `materials` (`material_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_assets_service` FOREIGN KEY (`service_id`) REFERENCES `services` (`service_id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Contraintes pour la table `purchase_orders`
--
ALTER TABLE `purchase_orders`
  ADD CONSTRAINT `fk_po_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_po_quote` FOREIGN KEY (`supplier_quote_id`) REFERENCES `supplier_quotes` (`supplier_quote_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_po_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`supplier_id`) ON UPDATE CASCADE;

--
-- Contraintes pour la table `purchase_order_lines`
--
ALTER TABLE `purchase_order_lines`
  ADD CONSTRAINT `fk_pol_material` FOREIGN KEY (`material_id`) REFERENCES `materials` (`material_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_pol_order` FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders` (`purchase_order_id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Contraintes pour la table `quote_requests`
--
ALTER TABLE `quote_requests`
  ADD CONSTRAINT `fk_quote_requests_user` FOREIGN KEY (`requested_by`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE;

--
-- Contraintes pour la table `quote_request_lines`
--
ALTER TABLE `quote_request_lines`
  ADD CONSTRAINT `fk_qrl_material` FOREIGN KEY (`material_id`) REFERENCES `materials` (`material_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_qrl_request` FOREIGN KEY (`quote_request_id`) REFERENCES `quote_requests` (`quote_request_id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Contraintes pour la table `quote_request_suppliers`
--
ALTER TABLE `quote_request_suppliers`
  ADD CONSTRAINT `fk_qrs_request` FOREIGN KEY (`quote_request_id`) REFERENCES `quote_requests` (`quote_request_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_qrs_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`supplier_id`) ON UPDATE CASCADE;

--
-- Contraintes pour la table `role_permissions`
--
ALTER TABLE `role_permissions`
  ADD CONSTRAINT `fk_role_permissions_permission` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`permission_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_role_permissions_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`role_id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Contraintes pour la table `stock_balances`
--
ALTER TABLE `stock_balances`
  ADD CONSTRAINT `fk_stock_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`location_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_stock_material` FOREIGN KEY (`material_id`) REFERENCES `materials` (`material_id`) ON UPDATE CASCADE;

--
-- Contraintes pour la table `stock_movements`
--
ALTER TABLE `stock_movements`
  ADD CONSTRAINT `fk_sm_destination` FOREIGN KEY (`destination_location_id`) REFERENCES `locations` (`location_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_sm_order` FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders` (`purchase_order_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_sm_service` FOREIGN KEY (`service_id`) REFERENCES `services` (`service_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_sm_source` FOREIGN KEY (`source_location_id`) REFERENCES `locations` (`location_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_sm_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`supplier_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_sm_user` FOREIGN KEY (`performed_by`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE;

--
-- Contraintes pour la table `stock_movement_lines`
--
ALTER TABLE `stock_movement_lines`
  ADD CONSTRAINT `fk_sml_material` FOREIGN KEY (`material_id`) REFERENCES `materials` (`material_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_sml_movement` FOREIGN KEY (`stock_movement_id`) REFERENCES `stock_movements` (`stock_movement_id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Contraintes pour la table `supplier_quotes`
--
ALTER TABLE `supplier_quotes`
  ADD CONSTRAINT `fk_supplier_quotes_request_supplier` FOREIGN KEY (`quote_request_id`,`supplier_id`) REFERENCES `quote_request_suppliers` (`quote_request_id`, `supplier_id`) ON UPDATE CASCADE;

--
-- Contraintes pour la table `supplier_quote_lines`
--
ALTER TABLE `supplier_quote_lines`
  ADD CONSTRAINT `fk_sql_quote` FOREIGN KEY (`supplier_quote_id`) REFERENCES `supplier_quotes` (`supplier_quote_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_sql_request_line` FOREIGN KEY (`quote_request_line_id`) REFERENCES `quote_request_lines` (`quote_request_line_id`) ON UPDATE CASCADE;

--
-- Contraintes pour la table `users`
--
ALTER TABLE `users`
  ADD CONSTRAINT `fk_users_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`role_id`) ON UPDATE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
