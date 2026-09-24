CREATE TABLE IF NOT EXISTS reservas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  cedula VARCHAR(20),
  telefono VARCHAR(30),
  marca VARCHAR(100),
  modelo VARCHAR(100),
  km VARCHAR(20),
  matricula VARCHAR(20),
  vehiculo_id INT NULL,
  mecanico_id INT NULL,
  tipo_turno VARCHAR(50),
  particular_tipo VARCHAR(50),
  garantia_tipo VARCHAR(50),
  garantia_fecha_compra VARCHAR(50),
  garantia_numero_service VARCHAR(50),
  garantia_problema TEXT,
  fecha DATE NOT NULL,
  hora VARCHAR(10) NOT NULL,
  detalles TEXT,
  estado VARCHAR(50) DEFAULT 'pendiente',
  notas TEXT
);

CREATE TABLE IF NOT EXISTS horarios_base (
  id INT AUTO_INCREMENT PRIMARY KEY,
  hora VARCHAR(10) UNIQUE NOT NULL,
  activo TINYINT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS bloqueos_horarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fecha DATE NOT NULL,
  hora VARCHAR(10) NOT NULL,
  motivo TEXT
);

CREATE TABLE IF NOT EXISTS historial_reservas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reserva_id INT NOT NULL,
  campo VARCHAR(100) NOT NULL,
  valor_anterior TEXT,
  valor_nuevo TEXT,
  fecha DATETIME NOT NULL,
  usuario VARCHAR(255),
  INDEX (reserva_id)
);

CREATE TABLE IF NOT EXISTS vehiculos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT NULL,
  dt_vehiculo_cod_id INT NULL,
  matricula VARCHAR(20) UNIQUE,
  marca VARCHAR(100),
  modelo VARCHAR(100),
  color VARCHAR(50),
  fecha_compra DATE NULL,
  motor VARCHAR(100),
  nombre VARCHAR(255),
  telefono VARCHAR(30),
  numero_motor VARCHAR(100),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehiculos_historial (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vehiculo_id INT NOT NULL,
  fecha DATE NOT NULL,
  km VARCHAR(20),
  tipo_turno VARCHAR(50),
  particular_tipo VARCHAR(50),
  garantia_tipo VARCHAR(50),
  garantia_fecha_compra VARCHAR(50),
  garantia_numero_service VARCHAR(50),
  garantia_problema TEXT,
  detalles TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX (vehiculo_id)
);

CREATE TABLE IF NOT EXISTS ingresos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT NOT NULL,
  reserva_id INT NULL,
  vehiculo_id INT NULL,
  vehiculo_marca VARCHAR(255) NULL,
  vehiculo_modelo VARCHAR(255) NULL,
  vehiculo_color VARCHAR(255) NULL,
  vehiculo_matricula VARCHAR(255) NULL,
  vehiculo_motor VARCHAR(255) NULL,
  cliente_correo VARCHAR(255) NULL,
  fecha_actual DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_salida DATETIME NULL,
  fecha_egreso DATETIME NULL,
  monto DECIMAL(12,2) NOT NULL DEFAULT 0,
  trabajo_realizado TEXT,
  numero_servicios VARCHAR(255) NULL,
  comentarios TEXT,
  observaciones TEXT,
  checklist_ingreso_json LONGTEXT,
  checklist_egreso_json LONGTEXT,
  trabajos_json LONGTEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(50) NOT NULL,
  permissions_json TEXT,
  activo TINYINT DEFAULT 1,
  es_mecanico_default TINYINT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auditoria_usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  actor_username VARCHAR(255),
  actor_role VARCHAR(50),
  accion VARCHAR(100) NOT NULL,
  target_username VARCHAR(255),
  detalle TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS horarios_aprontes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  hora VARCHAR(10) UNIQUE NOT NULL,
  cupo INT NOT NULL DEFAULT 1,
  activo TINYINT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS aprontes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT NULL,
  vehiculo_id INT NULL,
  mecanico_id INT NULL,
  nombre VARCHAR(255) NOT NULL,
  fecha DATE NOT NULL,
  hora VARCHAR(10) NOT NULL,
  telefono VARCHAR(30),
  localidad VARCHAR(100),
  observaciones TEXT,
  marca VARCHAR(100),
  modelo VARCHAR(100),
  numero_motor VARCHAR(100),
  factura VARCHAR(100),
  estado VARCHAR(60) DEFAULT 'APRONTE',
  repuestos_garantia TEXT,
  correo_alerta_garantia VARCHAR(255),
  dias_alerta_garantia INT DEFAULT 7,
  fecha_alerta_garantia DATE NULL,
  garantia_espera_desde DATETIME NULL,
  garantia_notificada TINYINT DEFAULT 0,
  garantia_notificada_at DATETIME NULL,
  created_by_username VARCHAR(255) NULL,
  created_by_role VARCHAR(50) NULL,
  caja_aprobado TINYINT DEFAULT 1,
  caja_aprobado_at DATETIME NULL,
  caja_aprobado_por VARCHAR(255) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX (fecha, hora)
);

CREATE TABLE IF NOT EXISTS clientes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cedula VARCHAR(50) UNIQUE,
  nombre VARCHAR(255) NOT NULL,
  telefono VARCHAR(50),
  localidad VARCHAR(100),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS motos_catalogo (
  id INT AUTO_INCREMENT PRIMARY KEY,
  marca VARCHAR(100) NOT NULL,
  modelo VARCHAR(100) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_motos_catalogo (marca, modelo)
);

CREATE TABLE IF NOT EXISTS ventas_motos (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  fecha DATE NOT NULL,
  apronte_id BIGINT NULL,
  marca VARCHAR(100) NOT NULL,
  modelo VARCHAR(100) NOT NULL,
  cliente VARCHAR(255) NOT NULL,
  telefono VARCHAR(30),
  comentario TEXT,
  vendedor VARCHAR(120),
  estado VARCHAR(60) NOT NULL DEFAULT 'en_apronte',
  dt_vehiculo_cod_id INT NULL,
  color VARCHAR(50),
  fecha_compra DATE NULL,
  motor VARCHAR(100),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ventas_motos_fecha (fecha),
  INDEX idx_ventas_motos_estado (estado)
);

CREATE TABLE IF NOT EXISTS vehiculos_sin_ingresar (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ci VARCHAR(50),
  motor VARCHAR(100),
  matricula VARCHAR(50),
  modelo VARCHAR(100),
  color VARCHAR(50),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dt_vehiculo_cod (
  id INT AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(50) UNIQUE NOT NULL,
  modelo VARCHAR(100) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS repuestos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS garantias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vehiculo_id INT NULL,
  motor VARCHAR(100),
  estado VARCHAR(60),
  texto TEXT,
  repuesto_id INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX (vehiculo_id),
  INDEX (repuesto_id)
);

CREATE TABLE IF NOT EXISTS servicios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vehiculo_id INT NULL,
  motor VARCHAR(100),
  estado VARCHAR(60),
  nro_servicio VARCHAR(50),
  km VARCHAR(20),
  matricula VARCHAR(50),
  telefono VARCHAR(50),
  texto TEXT,
  fecha_ingreso DATE NULL,
  fecha_egreso DATE NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX (vehiculo_id),
  INDEX (matricula)
);

CREATE TABLE IF NOT EXISTS ventas_creditos (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  fecha DATE NOT NULL,
  localidad VARCHAR(120) NOT NULL,
  telefono VARCHAR(30) NOT NULL,
  monto_solicitado DECIMAL(12,2) NOT NULL DEFAULT 0,
  concreta_venta TINYINT NOT NULL DEFAULT 0,
  financieras_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ventas_creditos_fecha (fecha)
);

