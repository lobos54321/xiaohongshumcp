package user

import (
	"fmt"
	"time"

	"gorm.io/gorm"

	"xiaohongshu-proxy/pkg/logger"
)

type Service struct {
	repo *Repository
}

func NewService() *Service {
	return &Service{
		repo: NewRepository(),
	}
}

// CreateUser 创建用户
func (s *Service) CreateUser(req *CreateUserRequest) (*User, error) {
	// 检查用户名是否已存在
	if _, err := s.repo.GetUserByUsername(req.Username); err == nil {
		return nil, fmt.Errorf("username already exists")
	} else if err != gorm.ErrRecordNotFound {
		return nil, fmt.Errorf("failed to check username: %w", err)
	}

	// 检查邮箱是否已存在
	if _, err := s.repo.GetUserByEmail(req.Email); err == nil {
		return nil, fmt.Errorf("email already exists")
	} else if err != gorm.ErrRecordNotFound {
		return nil, fmt.Errorf("failed to check email: %w", err)
	}

	// 创建用户
	user := &User{
		Username: req.Username,
		Email:    req.Email,
		Name:     req.Name,
		Status:   "active",
		Plan:     "free",
	}

	// 哈希密码
	if err := user.HashPassword(req.Password); err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	// 保存到数据库
	if err := s.repo.CreateUser(user); err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	logger.WithFields(map[string]interface{}{
		"user_id":  user.ID,
		"username": user.Username,
		"email":    user.Email,
	}).Info("User created successfully")

	return user, nil
}

// Authenticate 用户认证
func (s *Service) Authenticate(req *LoginRequest) (*User, error) {
	// 可以用用户名或邮箱登录
	var user *User
	var err error

	if user, err = s.repo.GetUserByUsername(req.Username); err != nil {
		if user, err = s.repo.GetUserByEmail(req.Username); err != nil {
			return nil, fmt.Errorf("invalid credentials")
		}
	}

	// 检查密码
	if !user.CheckPassword(req.Password) {
		return nil, fmt.Errorf("invalid credentials")
	}

	// 检查用户状态
	if user.Status != "active" {
		return nil, fmt.Errorf("user account is %s", user.Status)
	}

	logger.WithFields(map[string]interface{}{
		"user_id":  user.ID,
		"username": user.Username,
	}).Info("User authenticated successfully")

	return user, nil
}

// GetUserByID 根据ID获取用户
func (s *Service) GetUserByID(id string) (*User, error) {
	return s.repo.GetUserByID(id)
}

// GetUserByAPIKey 根据API Key获取用户
func (s *Service) GetUserByAPIKey(apiKey string) (*User, error) {
	return s.repo.GetUserByAPIKey(apiKey)
}

// UpdateUser 更新用户
func (s *Service) UpdateUser(userID string, req *UpdateUserRequest) (*User, error) {
	user, err := s.repo.GetUserByID(userID)
	if err != nil {
		return nil, fmt.Errorf("user not found")
	}

	// 更新字段
	if req.Name != "" {
		user.Name = req.Name
	}
	if req.Avatar != "" {
		user.Avatar = req.Avatar
	}

	if err := s.repo.UpdateUser(user); err != nil {
		return nil, fmt.Errorf("failed to update user: %w", err)
	}

	logger.WithFields(map[string]interface{}{
		"user_id": user.ID,
	}).Info("User updated successfully")

	return user, nil
}

// CreateXiaohongshuAccount 创建小红书账号
func (s *Service) CreateXiaohongshuAccount(userID, accountName string) (*XiaohongshuAccount, error) {
	// 检查用户是否存在
	user, err := s.repo.GetUserByID(userID)
	if err != nil {
		return nil, fmt.Errorf("user not found")
	}

	// 检查用户的账号数量限制
	accounts, err := s.repo.GetXiaohongshuAccountsByUserID(userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get user accounts: %w", err)
	}

	maxAccounts := s.getMaxAccountsByPlan(user.Plan)
	if len(accounts) >= maxAccounts {
		return nil, fmt.Errorf("maximum number of accounts reached for plan %s (max: %d)", user.Plan, maxAccounts)
	}

	// 创建账号
	account := &XiaohongshuAccount{
		UserID:      userID,
		AccountName: accountName,
		Status:      "inactive",
		LastUsed:    time.Now(),
	}

	if err := s.repo.CreateXiaohongshuAccount(account); err != nil {
		return nil, fmt.Errorf("failed to create account: %w", err)
	}

	logger.WithFields(map[string]interface{}{
		"user_id":      userID,
		"account_id":   account.ID,
		"account_name": accountName,
	}).Info("Xiaohongshu account created successfully")

	return account, nil
}

// GetUserAccounts 获取用户的小红书账号列表
func (s *Service) GetUserAccounts(userID string) ([]*XiaohongshuAccount, error) {
	return s.repo.GetXiaohongshuAccountsByUserID(userID)
}

// RecordUsage 记录使用情况
func (s *Service) RecordUsage(userID, action string, success bool, message string, cost float64, duration int64) error {
	record := &UsageRecord{
		UserID:   userID,
		Action:   action,
		Success:  success,
		Message:  message,
		Cost:     cost,
		Duration: duration,
	}

	if err := s.repo.CreateUsageRecord(record); err != nil {
		logger.WithFields(map[string]interface{}{
			"user_id": userID,
			"action":  action,
			"error":   err.Error(),
		}).Error("Failed to record usage")
		return fmt.Errorf("failed to record usage: %w", err)
	}

	return nil
}

// GetUserStats 获取用户统计信息
func (s *Service) GetUserStats(userID string) (map[string]interface{}, error) {
	return s.repo.GetUserStats(userID)
}

// GetUsageHistory 获取使用历史
func (s *Service) GetUsageHistory(userID string, page, size int) ([]*UsageRecord, int64, error) {
	offset := (page - 1) * size
	return s.repo.GetUsageRecordsByUserID(userID, offset, size)
}

// 根据套餐获取最大账号数
func (s *Service) getMaxAccountsByPlan(plan string) int {
	switch plan {
	case "free":
		return 1
	case "basic":
		return 3
	case "pro":
		return 10
	case "enterprise":
		return 50
	default:
		return 1
	}
}