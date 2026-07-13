import pool from './db';

const migrateDispatchColumns = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('Starting DB migration for Inland Dispatch structure...');

    // 1. Remove B/L level truck columns from shipments
    console.log('Dropping truck columns from shipments...');
    try {
      await connection.query('ALTER TABLE shipments DROP COLUMN truck_date');
      await connection.query('ALTER TABLE shipments DROP COLUMN truck_plate_number');
      await connection.query('ALTER TABLE shipments DROP COLUMN truck_driver_phone');
      console.log('✅ Dropped truck columns from shipments table');
    } catch (e: any) {
      console.log(`⚠️ Could not drop shipments columns (might already be dropped): ${e.message}`);
    }

    // 2. Add vehicle-level dispatch columns to vehicles
    console.log('Adding dispatch columns to vehicles...');
    try {
      await connection.query(`
        ALTER TABLE vehicles
        ADD COLUMN dispatch_method ENUM('CAR_CARRIER', 'DRIVER_DISPATCH', 'SELF_LOADER') NULL COMMENT '탁송 방식',
        ADD COLUMN dispatch_status ENUM('PENDING', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED') DEFAULT 'PENDING' COMMENT '탁송 상태',
        ADD COLUMN carrier_company VARCHAR(100) NULL COMMENT '운송사',
        ADD COLUMN truck_plate_number VARCHAR(50) NULL COMMENT '캐리어 차량번호',
        ADD COLUMN truck_driver_phone VARCHAR(20) NULL COMMENT '운송기사 연락처',
        ADD COLUMN dispatch_date DATE NULL COMMENT '내륙 배차일',
        ADD COLUMN inland_cost_krw DECIMAL(15, 0) DEFAULT 0 COMMENT '내륙 탁송 원가',
        ADD COLUMN surcharge_cost_krw DECIMAL(15, 0) DEFAULT 0 COMMENT '할증 비용'
      `);
      console.log('✅ Added dispatch columns to vehicles table');
    } catch (e: any) {
      console.log(`⚠️ Could not add vehicles columns (might already exist): ${e.message}`);
    }

    connection.release();
    console.log('🎉 Migration for Inland Dispatch structure completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration Error:', error);
    process.exit(1);
  }
};

migrateDispatchColumns();
