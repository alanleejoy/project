const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mysql = require('mysql2');
const path = require('path');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// MySQL Database Setup
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',  // Set your password if you have one
  database: 'restaurant_db'
});

// Connect to the database
db.connect((err) => {
  if (err) throw err;
  console.log('Connected to MySQL Database');
});

// Serve static files (index.html) from the current directory
app.use(express.static(__dirname));  // This will serve index.html and other files in the same folder

// Generate QR Code for the restaurant (links to /enter-table)
app.get('/qr', (req, res) => {
  const url = `http://10.0.0.118:3000/enter-table`;  // QR code will lead to the table number prompt page
  
  QRCode.toDataURL(url, (err, qrCodeData) => {
    if (err) throw err;
    res.send(`<img src="${qrCodeData}" />`);
  });
});

// Route for entering the table number
app.get('/enter-table', (req, res) => {
  res.send(`
    <h1>Enter Table Number</h1>
    <form action="/redirect-to-index" method="GET">
      <label for="tableNumber">Table Number:</label>
      <input type="number" name="tableNumber" required />
      <button type="submit">Submit</button>
    </form>
  `);
});

// Handle the redirect after table number is submitted
app.get('/redirect-to-index', (req, res) => {
  const tableNumber = req.query.tableNumber;
  if (!tableNumber) {
    return res.status(400).send('Table number is required');
  }

  // Redirect to index.html and pass the table number as a query parameter
  res.redirect(`/index.html?tableNumber=${tableNumber}`);
});

// Route to fetch the menu based on the table number
app.get('/menu', (req, res) => {
    const tableNumber = req.query.tableNumber;  // Get the table number from the query string
    if (!tableNumber) {
      return res.status(400).send('Table number is required');
    }
  
    // Fetch the menu items from the database
    db.query('SELECT * FROM menu', (err, results) => {
      if (err) throw err;
  
      // Send the menu data as JSON
      res.json(results);
    });
  });

  app.post('/order', express.json(), (req, res) => {
    const { tableNumber, items } = req.body;
  
    // Debugging: Log the received data
    console.log("Received order data:", { tableNumber, items });
  
    if (!tableNumber || !items) {
      return res.status(400).send('Invalid order data');
    }
  
    // Insert the order into the database
    db.query('INSERT INTO orders (table_number, items, status) VALUES (?, ?, ?)', [tableNumber, JSON.stringify(items), 'pending'], (err, results) => {
      if (err) {
        console.error('Error inserting order:', err);
        return res.status(500).json({ success: false, message: 'Error placing order' });
      }
  
      // Log the results of the insert query
      console.log('Order inserted with ID:', results.insertId);
  
      // Emit event for real-time update (optional)
      io.emit('new_order', { tableNumber, items });
  
      // Send response indicating the order was placed
      res.json({ success: true, message: 'Order placed successfully', orderId: results.insertId });
    });
  });
  
  
  
  
  app.get('/view-orders', (req, res) => {
    db.query('SELECT * FROM orders', (err, results) => {
      if (err) throw err;
  
      // Render the orders as an HTML table (you could also use a template engine like EJS if desired)
      let ordersHTML = '<h1>Orders</h1><table><tr><th>ID</th><th>Table Number</th><th>Items</th><th>Status</th></tr>';
      
      results.forEach(order => {
        ordersHTML += `
          <tr>
            <td>${order.id}</td>
            <td>${order.table_number}</td>
            <td>${JSON.stringify(JSON.parse(order.items))}</td>
            <td>${order.status}</td>
          </tr>
        `;
      });
  
      ordersHTML += '</table>';
  
      // Send the orders as an HTML response
      res.send(ordersHTML);
    });
  });
  
  // Route to show orders for the kitchen
app.get('/kitchen', (req, res) => {
    db.query('SELECT * FROM orders', (err, results) => {
      if (err) throw err;
  
      // Render the orders for the kitchen as HTML (you can replace this with a template engine like EJS if needed)
      let ordersHTML = '<h1>Kitchen Orders</h1><table><tr><th>ID</th><th>Table Number</th><th>Items</th><th>Status</th><th>Actions</th></tr>';
  
      results.forEach(order => {
        ordersHTML += `
          <tr>
            <td>${order.id}</td>
            <td>${order.table_number}</td>
            <td>${JSON.stringify(JSON.parse(order.items))}</td>
            <td>
              <select id="status-${order.id}">
                <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Pending</option>
                <option value="in_process" ${order.status === 'in_process' ? 'selected' : ''}>In Process</option>
                <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>Delivered</option>
              </select>
            </td>
            <td><button onclick="updateStatus(${order.id})">Update Status</button></td>
          </tr>
        `;
      });
  
      ordersHTML += '</table>';
      res.send(ordersHTML);
    });
  });

// Route to update the order status
app.post('/update-order-status', express.json(), (req, res) => {
    const { orderId, newStatus } = req.body;
  
    if (!orderId || !newStatus) {
      return res.status(400).send('Missing order ID or status');
    }
  
    // Update the order status in the database
    db.query('UPDATE orders SET status = ? WHERE id = ?', [newStatus, orderId], (err, results) => {
      if (err) {
        console.error('Error updating order status:', err);
        return res.status(500).send('Error updating order status');
      }
  
      // Emit an event to notify the front desk or kitchen in real-time
      io.emit('order_status_updated', { orderId, newStatus });
  
      // Send response indicating the status was updated
      res.json({ success: true, message: 'Order status updated successfully' });
    });
  });
    
  // Route to view order details and calculate the bill at the front desk
// Route to view order details and calculate the bill at the front desk
app.get('/front-desk', (req, res) => {
    console.log('Fetching pending orders...');
    
    // Query the orders table for all orders with status 'pending'
    db.query('SELECT * FROM orders WHERE status = "pending"', (err, results) => {
      if (err) {
        console.error('Error fetching orders:', err);
        return res.status(500).send('Error fetching pending orders');
      }
  
      if (results.length === 0) {
        console.log('No pending orders found');
        return res.status(404).send('No pending orders found');
      }
  
      console.log(`Found ${results.length} pending orders`);
  
      const ordersDetails = [];
  
      // Use a Promise.all to handle multiple asynchronous database queries
      const promises = results.map(order => {
        return new Promise((resolve, reject) => {
          let items = order.items ? JSON.parse(order.items) : [];
  
          if (items.length === 0) {
            console.log(`Order ${order.id} has no items`);
            resolve();  // Resolve immediately for orders with no items
            return;
          }
  
          console.log(`Processing order ${order.id} with ${items.length} items`);
  
          let totalPrice = 0;
          const itemDetails = [];
  
          // Fetch menu items to calculate prices for each order item
          const itemPromises = items.map(item => {
            return new Promise((itemResolve, itemReject) => {
              db.query('SELECT price, name FROM menu WHERE id = ?', [item.itemId], (err, menuResults) => {
                if (err) {
                  console.error('Error fetching menu item:', err);
                  itemReject(err); // Reject if there's an error
                  return;
                }
  
                const menuItem = menuResults[0];
                const itemPrice = menuItem ? menuItem.price : 0;
                const totalItemPrice = itemPrice * item.quantity;
                totalPrice += totalItemPrice;
  
                itemDetails.push({
                  name: menuItem.name,
                  quantity: item.quantity,
                  price: itemPrice,
                  total: totalItemPrice
                });
  
                itemResolve(); // Resolve when the item has been processed
              });
            });
          });
  
          // Wait for all items' price queries to finish
          Promise.all(itemPromises)
            .then(() => {
              ordersDetails.push({
                orderId: order.id,
                tableNumber: order.table_number,
                items: itemDetails,
                totalPrice: totalPrice
              });
  
              resolve(); // Resolve when all items for this order are processed
            })
            .catch((err) => {
              reject(err);  // Reject if there's an error in processing items
            });
        });
      });
  
      // Wait for all orders and items to be processed
      Promise.all(promises)
        .then(() => {
          console.log('Sending orders details as response', ordersDetails);
          res.json(ordersDetails);  // Send the final result as a response
        })
        .catch((err) => {
          console.error('Error processing orders:', err);
          res.status(500).send('Error processing orders');
        });
    });
  });

  
  

// Real-time Socket Communication (Kitchen/Front Desk)
io.on('connection', (socket) => {
  console.log('New connection');
});

server.listen(3000, '10.0.0.118', () => {  // Replace with your actual local IP
  console.log('Server running on http://10.0.0.118:3000');
});
