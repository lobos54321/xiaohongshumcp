package user

import (
	"fmt"

	"gorm.io/gorm"

	"xiaohongshu-proxy/pkg/database"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository() *Repository {
	return &Repository{
		db: database.GetDB(),
	}
}

// CreateUser 创建用户
func (r *Repository) CreateUser(user *User) error {
	return r.db.Create(user).Error
}

// GetUserByID 根据ID获取用户
func (r *Repository) GetUserByID(id string) (*User, error) {
	var user User
	err := r.db.Where("id = ?", id).First(&user).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// GetUserByUsername 根据用户名获取用户
func (r *Repository) GetUserByUsername(username string) (*User, error) {
	var user User
	err := r.db.Where("username = ?", username).First(&user).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// GetUserByEmail 根据邮箱获取用户
func (r *Repository) GetUserByEmail(email string) (*User, error) {
	var user User
	err := r.db.Where("email = ?", email).First(&user).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// GetUserByAPIKey 根据API Key获取用户
func (r *Repository) GetUserByAPIKey(apiKey string) (*User, error) {
	var user User
	err := r.db.Where("api_key = ?", apiKey).First(&user).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// UpdateUser 更新用户
func (r *Repository) UpdateUser(user *User) error {
	return r.db.Save(user).Error
}

// DeleteUser 删除用户
func (r *Repository) DeleteUser(id string) error {
	return r.db.Delete(&User{}, "id = ?", id).Error
}

// ListUsers 获取用户列表
func (r *Repository) ListUsers(offset, limit int) ([]*User, int64, error) {
	var users []*User
	var total int64

	// 获取总数
	if err := r.db.Model(&User{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// 获取分页数据
	err := r.db.Offset(offset).Limit(limit).Find(&users).Error
	return users, total, err
}

// CreateXiaohongshuAccount 创建小红书账号
func (r *Repository) CreateXiaohongshuAccount(account *XiaohongshuAccount) error {
	return r.db.Create(account).Error
}

// GetXiaohongshuAccountsByUserID 获取用户的小红书账号列表
func (r *Repository) GetXiaohongshuAccountsByUserID(userID string) ([]*XiaohongshuAccount, error) {
	var accounts []*XiaohongshuAccount
	err := r.db.Where("user_id = ?", userID).Find(&accounts).Error
	return accounts, err
}

// GetXiaohongshuAccountByID 根据ID获取小红书账号
func (r *Repository) GetXiaohongshuAccountByID(id string) (*XiaohongshuAccount, error) {
	var account XiaohongshuAccount
	err := r.db.Where("id = ?", id).First(&account).Error
	if err != nil {
		return nil, err
	}
	return &account, nil
}

// UpdateXiaohongshuAccount 更新小红书账号
func (r *Repository) UpdateXiaohongshuAccount(account *XiaohongshuAccount) error {
	return r.db.Save(account).Error
}

// DeleteXiaohongshuAccount 删除小红书账号
func (r *Repository) DeleteXiaohongshuAccount(id string) error {
	return r.db.Delete(&XiaohongshuAccount{}, "id = ?", id).Error
}

// CreateUsageRecord 创建使用记录
func (r *Repository) CreateUsageRecord(record *UsageRecord) error {
	return r.db.Create(record).Error
}

// GetUsageRecordsByUserID 获取用户的使用记录
func (r *Repository) GetUsageRecordsByUserID(userID string, offset, limit int) ([]*UsageRecord, int64, error) {
	var records []*UsageRecord
	var total int64

	// 获取总数
	if err := r.db.Model(&UsageRecord{}).Where("user_id = ?", userID).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// 获取分页数据
	err := r.db.Where("user_id = ?", userID).
		Order("created_at DESC").
		Offset(offset).
		Limit(limit).
		Find(&records).Error

	return records, total, err
}

// GetUserStats 获取用户统计信息
func (r *Repository) GetUserStats(userID string) (map[string]interface{}, error) {
	stats := make(map[string]interface{})

	// 小红书账号数量
	var accountCount int64
	if err := r.db.Model(&XiaohongshuAccount{}).Where("user_id = ?", userID).Count(&accountCount).Error; err != nil {
		return nil, fmt.Errorf("failed to count accounts: %w", err)
	}
	stats["account_count"] = accountCount

	// 总使用次数
	var totalUsage int64
	if err := r.db.Model(&UsageRecord{}).Where("user_id = ?", userID).Count(&totalUsage).Error; err != nil {
		return nil, fmt.Errorf("failed to count usage: %w", err)
	}
	stats["total_usage"] = totalUsage

	// 成功率
	var successCount int64
	if err := r.db.Model(&UsageRecord{}).Where("user_id = ? AND success = true", userID).Count(&successCount).Error; err != nil {
		return nil, fmt.Errorf("failed to count success: %w", err)
	}

	successRate := float64(0)
	if totalUsage > 0 {
		successRate = float64(successCount) / float64(totalUsage) * 100
	}
	stats["success_rate"] = successRate

	// 总费用
	var totalCost float64
	if err := r.db.Model(&UsageRecord{}).Where("user_id = ?", userID).Select("COALESCE(SUM(cost), 0)").Scan(&totalCost).Error; err != nil {
		return nil, fmt.Errorf("failed to sum cost: %w", err)
	}
	stats["total_cost"] = totalCost

	return stats, nil
}