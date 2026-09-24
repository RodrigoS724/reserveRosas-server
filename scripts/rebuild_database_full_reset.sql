-- REBUILD COMPLETO DE BASE DE DATOS
-- USO SOLO EN BASES DE PRUEBA
-- Borra todas las tablas conocidas y recrea el esquema actual desde cero.

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS vehiculo_eventos;
DROP TABLE IF EXISTS garantia_repuestos;
DROP TABLE IF EXISTS repuestos;
DROP TABLE IF EXISTS garantias;
DROP TABLE IF EXISTS ingresos;
DROP TABLE IF EXISTS reservas;
DROP TABLE IF EXISTS aprontes;
DROP TABLE IF EXISTS vehiculos_cliente;
DROP TABLE IF EXISTS vehiculo_cod;
DROP TABLE IF EXISTS dt_tipo_turno;
DROP TABLE IF EXISTS dt_estado_garantia;
DROP TABLE IF EXISTS dt_estado_reserva;
DROP TABLE IF EXISTS dt_estado_apronte;
DROP TABLE IF EXISTS clientes;
DROP TABLE IF EXISTS bloqueos_horarios;
DROP TABLE IF EXISTS horarios_aprontes;
DROP TABLE IF EXISTS horarios_base;
DROP TABLE IF EXISTS historial_reservas;
DROP TABLE IF EXISTS servicios;
DROP TABLE IF EXISTS vehiculo_historial;
DROP TABLE IF EXISTS ventas_creditos;
DROP TABLE IF EXISTS ventas_motos;
DROP TABLE IF EXISTS dt_vehiculos_cod;
DROP TABLE IF EXISTS vehiculos_sin_ingresar;
DROP TABLE IF EXISTS vehiculos;
DROP TABLE IF EXISTS usuarios;
DROP TABLE IF EXISTS auditoria_usuarios;

CREATE TABLE IF NOT EXISTS dt_estado_apronte (
	id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
	codigo VARCHAR(40) NOT NULL UNIQUE,
	nombre VARCHAR(100) NOT NULL,
	orden INT NOT NULL DEFAULT 0,
	activo TINYINT NOT NULL DEFAULT 1,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dt_estado_reserva (
	id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
	codigo VARCHAR(40) NOT NULL UNIQUE,
	nombre VARCHAR(100) NOT NULL,
	orden INT NOT NULL DEFAULT 0,
	activo TINYINT NOT NULL DEFAULT 1,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dt_estado_garantia (
	id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
	codigo VARCHAR(40) NOT NULL UNIQUE,
	nombre VARCHAR(100) NOT NULL,
	orden INT NOT NULL DEFAULT 0,
	activo TINYINT NOT NULL DEFAULT 1,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dt_tipo_turno (
	id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
	codigo VARCHAR(40) NOT NULL UNIQUE,
	nombre VARCHAR(100) NOT NULL,
	orden INT NOT NULL DEFAULT 0,
	activo TINYINT NOT NULL DEFAULT 1,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS horarios_base (
	id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
	hora VARCHAR(10) NOT NULL UNIQUE,
	activo TINYINT NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bloqueos_horarios (
	id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
	fecha DATE NOT NULL,
	hora VARCHAR(10) NOT NULL,
	motivo TEXT NULL,
	INDEX idx_bloqueos_horarios_fecha_hora (fecha, hora)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO dt_estado_apronte (codigo, nombre, orden) VALUES
('pendiente', 'Pendiente', 1),
('en_revision', 'En revision', 2),
('pronto', 'Pronto', 3),
('cancelado', 'Cancelado', 4);

INSERT IGNORE INTO dt_estado_reserva (codigo, nombre, orden) VALUES
('pendiente', 'Pendiente', 1),
('en_revision', 'En revision', 2),
('pronto', 'Pronto', 3),
('cancelado', 'Cancelado', 4);

INSERT IGNORE INTO dt_estado_garantia (codigo, nombre, orden) VALUES
('pendiente', 'Pendiente', 1),
('en_revision', 'En revision', 2),
('aprobada', 'Aprobada', 3),
('rechazada', 'Rechazada', 4);

INSERT IGNORE INTO dt_tipo_turno (codigo, nombre, orden) VALUES
('garantia', 'Garantia', 1),
('particular', 'Particular', 2),
('toma', 'Toma', 3);

INSERT IGNORE INTO horarios_base (hora, activo) VALUES
('08:00', 1), ('09:00', 1), ('10:00', 1), ('11:00', 1),
('13:00', 1), ('14:00', 1), ('15:00', 1), ('16:00', 1);

CREATE TABLE IF NOT EXISTS clientes (
	id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
	cedula VARCHAR(20) NOT NULL UNIQUE,
	nombre VARCHAR(255) NOT NULL,
	telefono VARCHAR(30) NULL,
	localidad VARCHAR(100) NULL,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	INDEX idx_clientes_nombre (nombre),
	INDEX idx_clientes_localidad (localidad)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vehiculo_cod (
	cod BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
	marca VARCHAR(100) NOT NULL,
	modelo VARCHAR(100) NOT NULL,
	tipo ENUM('moto', 'bicicleta', 'otro') NOT NULL DEFAULT 'otro',
	activo TINYINT NOT NULL DEFAULT 1,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	UNIQUE KEY uniq_vehiculo_cod (marca, modelo, tipo),
	INDEX idx_vehiculo_cod_tipo (tipo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vehiculos_cliente (
	id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
	cliente_id BIGINT UNSIGNED NOT NULL,
	cod_vehiculo BIGINT UNSIGNED NULL,
	motor VARCHAR(100) NULL,
	chasis VARCHAR(100) NULL,
	matricula VARCHAR(20) NULL,
	color VARCHAR(50) NULL,
	fecha_compra DATE NULL,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	UNIQUE KEY uniq_vehiculo_matricula (matricula),
	INDEX idx_vehiculos_cliente_cliente (cliente_id),
	INDEX idx_vehiculos_cliente_cod (cod_vehiculo),
	INDEX idx_vehiculos_cliente_motor (motor),
	CONSTRAINT fk_vehiculos_cliente_cliente
		FOREIGN KEY (cliente_id) REFERENCES clientes(id)
		ON UPDATE CASCADE
		ON DELETE RESTRICT,
	CONSTRAINT fk_vehiculos_cliente_cod
		FOREIGN KEY (cod_vehiculo) REFERENCES vehiculo_cod(cod)
		ON UPDATE CASCADE
		ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS aprontes (
	id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
	cliente_id BIGINT UNSIGNED NOT NULL,
	vehiculo_id BIGINT UNSIGNED NULL,
	mecanico_id BIGINT UNSIGNED NULL,
	nombre VARCHAR(255) NULL,
	fecha DATE NOT NULL,
	hora VARCHAR(10) NOT NULL,
	telefono VARCHAR(30) NULL,
	localidad VARCHAR(100) NULL,
	observacion TEXT NULL,
	marca VARCHAR(100) NULL,
	modelo VARCHAR(100) NULL,
	numero_motor VARCHAR(100) NULL,
	factura VARCHAR(100) NULL,
	estado VARCHAR(60) NOT NULL DEFAULT 'APRONTE',
	estado_id BIGINT UNSIGNED NOT NULL,
	repuestos_garantia TEXT NULL,
	correo_alerta_garantia VARCHAR(255) NULL,
	dias_alerta_garantia INT NOT NULL DEFAULT 7,
	fecha_alerta_garantia DATE NULL,
	garantia_espera_desde DATETIME NULL,
	garantia_notificada TINYINT NOT NULL DEFAULT 0,
	garantia_notificada_at DATETIME NULL,
	created_by_username VARCHAR(255) NULL,
	created_by_role VARCHAR(50) NULL,
	caja_aprobado TINYINT NOT NULL DEFAULT 1,
	caja_aprobado_at DATETIME NULL,
	caja_aprobado_por VARCHAR(255) NULL,
	ingreso_id BIGINT UNSIGNED NULL,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	INDEX idx_aprontes_fecha_hora (fecha, hora),
	INDEX idx_aprontes_cliente (cliente_id),
	INDEX idx_aprontes_vehiculo (vehiculo_id),
	INDEX idx_aprontes_mecanico (mecanico_id),
	INDEX idx_aprontes_estado (estado_id),
	CONSTRAINT fk_aprontes_cliente
		FOREIGN KEY (cliente_id) REFERENCES clientes(id)
		ON UPDATE CASCADE
		ON DELETE RESTRICT,
	CONSTRAINT fk_aprontes_vehiculo
		FOREIGN KEY (vehiculo_id) REFERENCES vehiculos_cliente(id)
		ON UPDATE CASCADE
		ON DELETE SET NULL,
	CONSTRAINT fk_aprontes_estado
		FOREIGN KEY (estado_id) REFERENCES dt_estado_apronte(id)
		ON UPDATE CASCADE
		ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reservas (
	id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
	cliente_id BIGINT UNSIGNED NOT NULL,
	vehiculo_id BIGINT UNSIGNED NULL,
	mecanico_id BIGINT UNSIGNED NULL,
	nombre VARCHAR(255) NULL,
	cedula VARCHAR(20) NULL,
	telefono VARCHAR(30) NULL,
	marca VARCHAR(100) NULL,
	modelo VARCHAR(100) NULL,
	matricula VARCHAR(20) NULL,
	km VARCHAR(20) NULL,
	tipo_turno_id BIGINT UNSIGNED NOT NULL,
	tipo_turno VARCHAR(50) NULL,
	particular_tipo VARCHAR(50) NULL,
	garantia_tipo VARCHAR(50) NULL,
	fecha_compra DATE NULL,
	nro_servicio VARCHAR(50) NULL,
	problema TEXT NULL,
	fecha DATE NOT NULL,
	hora VARCHAR(10) NOT NULL,
	detalle TEXT NULL,
	estado_id BIGINT UNSIGNED NOT NULL,
	estado VARCHAR(50) NOT NULL DEFAULT 'pendiente',
	ingreso_id BIGINT UNSIGNED NULL,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	INDEX idx_reservas_fecha_hora (fecha, hora),
	INDEX idx_reservas_cliente (cliente_id),
	INDEX idx_reservas_vehiculo (vehiculo_id),
	INDEX idx_reservas_mecanico (mecanico_id),
	INDEX idx_reservas_estado (estado_id),
	INDEX idx_reservas_tipo (tipo_turno_id),
	INDEX idx_reservas_ingreso (ingreso_id),
	CONSTRAINT fk_reservas_cliente
		FOREIGN KEY (cliente_id) REFERENCES clientes(id)
		ON UPDATE CASCADE
		ON DELETE RESTRICT,
	CONSTRAINT fk_reservas_vehiculo
		FOREIGN KEY (vehiculo_id) REFERENCES vehiculos_cliente(id)
		ON UPDATE CASCADE
		ON DELETE SET NULL,
	CONSTRAINT fk_reservas_tipo_turno
		FOREIGN KEY (tipo_turno_id) REFERENCES dt_tipo_turno(id)
		ON UPDATE CASCADE
		ON DELETE RESTRICT,
	CONSTRAINT fk_reservas_estado
		FOREIGN KEY (estado_id) REFERENCES dt_estado_reserva(id)
		ON UPDATE CASCADE
		ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ingresos (
	id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
	cliente_id BIGINT UNSIGNED NOT NULL,
	reserva_id BIGINT UNSIGNED NULL,
	fecha_actual DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	fecha_egreso DATETIME NULL,
	monto DECIMAL(12,2) NOT NULL DEFAULT 0,
	trabajo_realizado TEXT NULL,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	INDEX idx_ingresos_cliente (cliente_id),
	INDEX idx_ingresos_reserva (reserva_id),
	CONSTRAINT fk_ingresos_cliente
		FOREIGN KEY (cliente_id) REFERENCES clientes(id)
		ON UPDATE CASCADE
		ON DELETE RESTRICT,
	CONSTRAINT fk_ingresos_reserva
		FOREIGN KEY (reserva_id) REFERENCES reservas(id)
		ON UPDATE CASCADE
		ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS garantias (
	id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
	cliente_id BIGINT UNSIGNED NOT NULL,
	vehiculo_id BIGINT UNSIGNED NULL,
	estado_id BIGINT UNSIGNED NOT NULL,
	nombre VARCHAR(255) NULL,
	numero_garantia VARCHAR(50) NOT NULL,
	observacion TEXT NULL,
	marca VARCHAR(100) NULL,
	modelo VARCHAR(100) NULL,
	estado VARCHAR(60) NOT NULL DEFAULT 'PENDIENTE',
	repuestos_garantia TEXT NULL,
	correo_alerta_garantia VARCHAR(255) NULL,
	dias_alerta_garantia INT NOT NULL DEFAULT 7,
	fecha_alerta_garantia DATE NULL,
	garantia_espera_desde DATETIME NULL,
	garantia_notificada TINYINT NOT NULL DEFAULT 0,
	garantia_notificada_at DATETIME NULL,
	created_by_username VARCHAR(255) NULL,
	created_by_role VARCHAR(50) NULL,
	caja_aprobado TINYINT NOT NULL DEFAULT 1,
	caja_aprobado_at DATETIME NULL,
	caja_aprobado_por VARCHAR(255) NULL,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	INDEX idx_garantias_cliente (cliente_id),
	INDEX idx_garantias_vehiculo (vehiculo_id),
	INDEX idx_garantias_estado (estado_id),
	CONSTRAINT fk_garantias_cliente
		FOREIGN KEY (cliente_id) REFERENCES clientes(id)
		ON UPDATE CASCADE
		ON DELETE RESTRICT,
	CONSTRAINT fk_garantias_vehiculo
		FOREIGN KEY (vehiculo_id) REFERENCES vehiculos_cliente(id)
		ON UPDATE CASCADE
		ON DELETE SET NULL,
	CONSTRAINT fk_garantias_estado
		FOREIGN KEY (estado_id) REFERENCES dt_estado_garantia(id)
		ON UPDATE CASCADE
		ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS repuestos (
	id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
	nombre VARCHAR(255) NOT NULL,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	UNIQUE KEY uniq_repuestos_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS garantia_repuestos (
	id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
	garantia_id BIGINT UNSIGNED NOT NULL,
	repuesto_id BIGINT UNSIGNED NOT NULL,
	cantidad INT UNSIGNED NOT NULL DEFAULT 1,
	estado VARCHAR(50) NOT NULL DEFAULT 'pendiente',
	observacion TEXT NULL,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	INDEX idx_garantia_repuestos_garantia (garantia_id),
	INDEX idx_garantia_repuestos_repuesto (repuesto_id),
	CONSTRAINT fk_garantia_repuestos_garantia
		FOREIGN KEY (garantia_id) REFERENCES garantias(id)
		ON UPDATE CASCADE
		ON DELETE CASCADE,
	CONSTRAINT fk_garantia_repuestos_repuesto
		FOREIGN KEY (repuesto_id) REFERENCES repuestos(id)
		ON UPDATE CASCADE
		ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vehiculo_eventos (
	id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
	cliente_id BIGINT UNSIGNED NOT NULL,
	vehiculo_id BIGINT UNSIGNED NULL,
	reserva_id BIGINT UNSIGNED NULL,
	apronte_id BIGINT UNSIGNED NULL,
	garantia_id BIGINT UNSIGNED NULL,
	ingreso_id BIGINT UNSIGNED NULL,
	tipo_evento ENUM('reserva', 'apronte', 'garantia', 'ingreso', 'servicio', 'nota') NOT NULL,
	fecha_evento DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	titulo VARCHAR(255) NULL,
	detalle TEXT NULL,
	km VARCHAR(20) NULL,
	tipo_turno VARCHAR(50) NULL,
	particular_tipo VARCHAR(50) NULL,
	garantia_tipo VARCHAR(50) NULL,
	garantia_fecha_compra VARCHAR(50) NULL,
	garantia_numero_service VARCHAR(50) NULL,
	garantia_problema TEXT NULL,
	numero_motor VARCHAR(100) NULL,
	factura VARCHAR(100) NULL,
	color VARCHAR(50) NULL,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	INDEX idx_vehiculo_eventos_cliente (cliente_id),
	INDEX idx_vehiculo_eventos_vehiculo (vehiculo_id),
	INDEX idx_vehiculo_eventos_reserva (reserva_id),
	INDEX idx_vehiculo_eventos_apronte (apronte_id),
	INDEX idx_vehiculo_eventos_garantia (garantia_id),
	INDEX idx_vehiculo_eventos_ingreso (ingreso_id),
	CONSTRAINT fk_vehiculo_eventos_cliente
		FOREIGN KEY (cliente_id) REFERENCES clientes(id)
		ON UPDATE CASCADE
		ON DELETE RESTRICT,
	CONSTRAINT fk_vehiculo_eventos_vehiculo
		FOREIGN KEY (vehiculo_id) REFERENCES vehiculos_cliente(id)
		ON UPDATE CASCADE
		ON DELETE SET NULL,
	CONSTRAINT fk_vehiculo_eventos_reserva
		FOREIGN KEY (reserva_id) REFERENCES reservas(id)
		ON UPDATE CASCADE
		ON DELETE SET NULL,
	CONSTRAINT fk_vehiculo_eventos_apronte
		FOREIGN KEY (apronte_id) REFERENCES aprontes(id)
		ON UPDATE CASCADE
		ON DELETE SET NULL,
	CONSTRAINT fk_vehiculo_eventos_garantia
		FOREIGN KEY (garantia_id) REFERENCES garantias(id)
		ON UPDATE CASCADE
		ON DELETE SET NULL,
	CONSTRAINT fk_vehiculo_eventos_ingreso
		FOREIGN KEY (ingreso_id) REFERENCES ingresos(id)
		ON UPDATE CASCADE
		ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
