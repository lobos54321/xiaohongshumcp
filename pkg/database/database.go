package database

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"xiaohongshu-proxy/internal/config"
	appLogger "xiaohongshu-proxy/pkg/logger"
)

var DB *gorm.DB

func Init(cfg *config.DatabaseConfig) error {
	var dialector gorm.Dialector

	// 判断是否使用SQLite
	if strings.Contains(cfg.Name, ".db") || cfg.Host == "" {
		// 使用SQLite
		dbPath := cfg.Name
		if dbPath == "" {
			dbPath = "./data/xiaohongshu.db"
		}

		// 确保数据目录存在
		if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
			return fmt.Errorf("failed to create data directory: %w", err)
		}

		dialector = sqlite.Open(dbPath)
		appLogger.Info("Using SQLite database: %s", dbPath)
	} else {
		// 使用PostgreSQL
		dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%d sslmode=%s",
			cfg.Host, cfg.User, cfg.Password, cfg.Name, cfg.Port, cfg.SSLMode)
		dialector = postgres.Open(dsn)
		appLogger.Info("Using PostgreSQL database")
	}

	var err error
	DB, err = gorm.Open(dialector, &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}

	sqlDB, err := DB.DB()
	if err != nil {
		return fmt.Errorf("failed to get underlying sql.DB: %w", err)
	}

	// 设置连接池（SQLite不需要太多连接）
	maxConns := cfg.MaxConnections
	if maxConns == 0 {
		maxConns = 25
	}
	maxIdleConns := cfg.MaxIdleConnections
	if maxIdleConns == 0 {
		maxIdleConns = 5
	}

	// SQLite使用较少的连接
	if strings.Contains(cfg.Name, ".db") || cfg.Host == "" {
		maxConns = 1
		maxIdleConns = 1
	}

	sqlDB.SetMaxOpenConns(maxConns)
	sqlDB.SetMaxIdleConns(maxIdleConns)
	sqlDB.SetConnMaxLifetime(time.Hour)

	// 测试连接
	if err := sqlDB.Ping(); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	appLogger.Info("Database connected successfully")
	return nil
}

func GetDB() *gorm.DB {
	return DB
}

func Close() error {
	if DB != nil {
		sqlDB, err := DB.DB()
		if err != nil {
			return err
		}
		return sqlDB.Close()
	}
	return nil
}