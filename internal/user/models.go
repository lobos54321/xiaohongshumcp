package user

import (
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// User 用户模型
type User struct {
	ID        string    `json:"id" gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	Username  string    `json:"username" gorm:"uniqueIndex;not null"`
	Email     string    `json:"email" gorm:"uniqueIndex;not null"`
	Password  string    `json:"-" gorm:"not null"`
	Name      string    `json:"name"`
	Avatar    string    `json:"avatar"`
	Status    string    `json:"status" gorm:"default:'active'"` // active, inactive, suspended
	Plan      string    `json:"plan" gorm:"default:'free'"`     // free, basic, pro, enterprise
	APIKey    string    `json:"api_key" gorm:"uniqueIndex"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	// 关联关系
	Accounts     []XiaohongshuAccount `json:"accounts,omitempty" gorm:"foreignKey:UserID"`
	UsageRecords []UsageRecord        `json:"usage_records,omitempty" gorm:"foreignKey:UserID"`
}

// XiaohongshuAccount 小红书账号信息
type XiaohongshuAccount struct {
	ID          string    `json:"id" gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	UserID      string    `json:"user_id" gorm:"not null;index"`
	AccountName string    `json:"account_name"`
	Status      string    `json:"status" gorm:"default:'inactive'"` // active, inactive, error
	ContainerID string    `json:"container_id"`
	Port        int       `json:"port"`
	LastUsed    time.Time `json:"last_used"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`

	// 关联关系
	User User `json:"user,omitempty" gorm:"foreignKey:UserID"`
}

// UsageRecord 使用记录
type UsageRecord struct {
	ID        string    `json:"id" gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	UserID    string    `json:"user_id" gorm:"not null;index"`
	Action    string    `json:"action"`    // publish_content, search_feeds, etc.
	Success   bool      `json:"success"`
	Message   string    `json:"message"`
	Cost      float64   `json:"cost"`      // API 调用成本
	Duration  int64     `json:"duration"`  // 执行时间（毫秒）
	CreatedAt time.Time `json:"created_at"`

	// 关联关系
	User User `json:"user,omitempty" gorm:"foreignKey:UserID"`
}

// CreateUserRequest 创建用户请求
type CreateUserRequest struct {
	Username string `json:"username" binding:"required,min=3,max=50"`
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
	Name     string `json:"name" binding:"max=100"`
}

// LoginRequest 登录请求
type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// UpdateUserRequest 更新用户请求
type UpdateUserRequest struct {
	Name   string `json:"name" binding:"max=100"`
	Avatar string `json:"avatar" binding:"url"`
}

// UserResponse 用户响应
type UserResponse struct {
	ID       string    `json:"id"`
	Username string    `json:"username"`
	Email    string    `json:"email"`
	Name     string    `json:"name"`
	Avatar   string    `json:"avatar"`
	Status   string    `json:"status"`
	Plan     string    `json:"plan"`
	APIKey   string    `json:"api_key"`
	CreatedAt time.Time `json:"created_at"`
}

// BeforeCreate GORM 钩子，在创建前执行
func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.ID == "" {
		u.ID = uuid.New().String()
	}
	if u.APIKey == "" {
		u.APIKey = "xhp_" + uuid.New().String()
	}
	return nil
}

// HashPassword 密码哈希
func (u *User) HashPassword(password string) error {
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	u.Password = string(hashedPassword)
	return nil
}

// CheckPassword 验证密码
func (u *User) CheckPassword(password string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(u.Password), []byte(password))
	return err == nil
}

// ToResponse 转换为响应格式
func (u *User) ToResponse() UserResponse {
	return UserResponse{
		ID:       u.ID,
		Username: u.Username,
		Email:    u.Email,
		Name:     u.Name,
		Avatar:   u.Avatar,
		Status:   u.Status,
		Plan:     u.Plan,
		APIKey:   u.APIKey,
		CreatedAt: u.CreatedAt,
	}
}