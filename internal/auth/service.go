package auth

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"xiaohongshu-proxy/internal/config"
)

type Claims struct {
	UserID   string `json:"user_id"`
	Username string `json:"username"`
	Plan     string `json:"plan"`
	jwt.RegisteredClaims
}

type Service struct {
	jwtSecret string
	expiresIn time.Duration
}

func NewService(cfg *config.JWTConfig) *Service {
	return &Service{
		jwtSecret: cfg.Secret,
		expiresIn: cfg.ExpiresIn,
	}
}

// GenerateToken 生成JWT token
func (s *Service) GenerateToken(userID, username, plan string) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID:   userID,
		Username: username,
		Plan:     plan,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(s.expiresIn)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			Issuer:    "xiaohongshu-proxy",
			Subject:   userID,
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(s.jwtSecret))
	if err != nil {
		return "", fmt.Errorf("failed to sign token: %w", err)
	}

	return tokenString, nil
}

// ValidateToken 验证JWT token
func (s *Service) ValidateToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(s.jwtSecret), nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to parse token: %w", err)
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token")
	}

	return claims, nil
}

// RefreshToken 刷新token
func (s *Service) RefreshToken(tokenString string) (string, error) {
	claims, err := s.ValidateToken(tokenString)
	if err != nil {
		return "", err
	}

	// 检查token是否即将过期（剩余时间少于1小时）
	if time.Until(claims.ExpiresAt.Time) > time.Hour {
		return "", fmt.Errorf("token is still valid, no need to refresh")
	}

	// 生成新token
	return s.GenerateToken(claims.UserID, claims.Username, claims.Plan)
}