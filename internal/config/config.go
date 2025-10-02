package config

import (
	"fmt"
	"os"
	"time"

	"github.com/joho/godotenv"
	"github.com/spf13/viper"
)

type Config struct {
	App       AppConfig       `mapstructure:"app"`
	Database  DatabaseConfig  `mapstructure:"database"`
	Redis     RedisConfig     `mapstructure:"redis"`
	JWT       JWTConfig       `mapstructure:"jwt"`
	Claude    ClaudeConfig    `mapstructure:"claude"`
	MCP       MCPConfig       `mapstructure:"mcp"`
	Container ContainerConfig `mapstructure:"container"`
	Logging   LoggingConfig   `mapstructure:"logging"`
	Security  SecurityConfig  `mapstructure:"security"`
}

type AppConfig struct {
	Name        string `mapstructure:"name"`
	Version     string `mapstructure:"version"`
	Environment string `mapstructure:"environment"`
	Host        string `mapstructure:"host"`
	Port        int    `mapstructure:"port"`
}

type DatabaseConfig struct {
	Host               string `mapstructure:"host"`
	Port               int    `mapstructure:"port"`
	User               string `mapstructure:"user"`
	Password           string `mapstructure:"password"`
	Name               string `mapstructure:"name"`
	SSLMode            string `mapstructure:"ssl_mode"`
	MaxConnections     int    `mapstructure:"max_connections"`
	MaxIdleConnections int    `mapstructure:"max_idle_connections"`
}

type RedisConfig struct {
	Host     string `mapstructure:"host"`
	Port     int    `mapstructure:"port"`
	Password string `mapstructure:"password"`
	DB       int    `mapstructure:"db"`
	PoolSize int    `mapstructure:"pool_size"`
}

type JWTConfig struct {
	Secret    string        `mapstructure:"secret"`
	ExpiresIn time.Duration `mapstructure:"expires_in"`
}

type ClaudeConfig struct {
	APIKey     string        `mapstructure:"api_key"`
	BaseURL    string        `mapstructure:"base_url"`
	Timeout    time.Duration `mapstructure:"timeout"`
	MaxRetries int           `mapstructure:"max_retries"`
}

type MCPConfig struct {
	BaseURL        string        `mapstructure:"base_url"`
	Timeout        time.Duration `mapstructure:"timeout"`
	MaxConnections int           `mapstructure:"max_connections"`
}

type ContainerConfig struct {
	Registry        string        `mapstructure:"registry"`
	BasePort        int           `mapstructure:"base_port"`
	MaxPerUser      int           `mapstructure:"max_per_user"`
	AutoCleanup     bool          `mapstructure:"auto_cleanup"`
	CleanupInterval time.Duration `mapstructure:"cleanup_interval"`
}

type LoggingConfig struct {
	Level  string `mapstructure:"level"`
	Format string `mapstructure:"format"`
	Output string `mapstructure:"output"`
}

type SecurityConfig struct {
	RateLimit RateLimitConfig `mapstructure:"rate_limit"`
	CORS      CORSConfig      `mapstructure:"cors"`
}

type RateLimitConfig struct {
	RequestsPerMinute int `mapstructure:"requests_per_minute"`
	Burst             int `mapstructure:"burst"`
}

type CORSConfig struct {
	AllowOrigins []string `mapstructure:"allow_origins"`
	AllowMethods []string `mapstructure:"allow_methods"`
	AllowHeaders []string `mapstructure:"allow_headers"`
}

var GlobalConfig *Config

func Load(configPath string) (*Config, error) {
	// 加载 .env 文件（如果存在）
	if err := godotenv.Load(); err != nil {
		// .env 文件不存在不是错误
	}

	viper.SetConfigName("config")
	viper.SetConfigType("yaml")
	viper.AddConfigPath(configPath)
	viper.AddConfigPath("./configs")
	viper.AddConfigPath(".")

	// 环境变量绑定
	viper.AutomaticEnv()
	viper.SetEnvPrefix("APP")

	// 读取配置文件
	if err := viper.ReadInConfig(); err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	// 从环境变量覆盖配置
	overrideFromEnv()

	var config Config
	if err := viper.Unmarshal(&config); err != nil {
		return nil, fmt.Errorf("failed to unmarshal config: %w", err)
	}

	// 验证必需的配置
	if err := validateConfig(&config); err != nil {
		return nil, fmt.Errorf("invalid config: %w", err)
	}

	GlobalConfig = &config
	return &config, nil
}

func overrideFromEnv() {
	if env := os.Getenv("APP_ENV"); env != "" {
		viper.Set("app.environment", env)
	}
	if port := os.Getenv("APP_PORT"); port != "" {
		viper.Set("app.port", port)
	}
	if host := os.Getenv("APP_HOST"); host != "" {
		viper.Set("app.host", host)
	}

	// 数据库配置
	if dbHost := os.Getenv("DB_HOST"); dbHost != "" {
		viper.Set("database.host", dbHost)
	}
	if dbPassword := os.Getenv("DB_PASSWORD"); dbPassword != "" {
		viper.Set("database.password", dbPassword)
	}

	// Claude API 配置
	if claudeKey := os.Getenv("CLAUDE_API_KEY"); claudeKey != "" {
		viper.Set("claude.api_key", claudeKey)
	}

	// JWT 配置
	if jwtSecret := os.Getenv("JWT_SECRET"); jwtSecret != "" {
		viper.Set("jwt.secret", jwtSecret)
	}
}

func validateConfig(config *Config) error {
	if config.Claude.APIKey == "" || config.Claude.APIKey == "your-claude-api-key" {
		return fmt.Errorf("Claude API key is required")
	}

	if config.JWT.Secret == "" || config.JWT.Secret == "your-super-secret-jwt-key" {
		return fmt.Errorf("JWT secret is required and should be changed from default")
	}

	if config.Database.Password == "" || config.Database.Password == "password" {
		return fmt.Errorf("database password is required and should be changed from default")
	}

	return nil
}

func Get() *Config {
	return GlobalConfig
}