-- Create Database
CREATE DATABASE restaurant_db;

-- Use the database
USE restaurant_db;

-- Create menu table
CREATE TABLE menu (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255),
  price DECIMAL(10, 2)
);

-- Create orders table
CREATE TABLE orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  table_number INT,
  items TEXT,
  status VARCHAR(50)
);

-- Insert sample menu items
INSERT INTO menu (name, price) VALUES ('Burger', 5.99);
INSERT INTO menu (name, price) VALUES ('Pizza', 8.99);
INSERT INTO menu (name, price) VALUES ('Pasta', 7.49);

-- Grant privileges to root user (ensure 'yourpassword' is the correct one)
GRANT ALL PRIVILEGES ON restaurant_db.* TO 'root'@'localhost' IDENTIFIED BY 'yourpassword';
FLUSH PRIVILEGES;
