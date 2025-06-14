const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = 3000;

// Set up view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

// SQLite Database
const db = new sqlite3.Database('./database.db', (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to SQLite database.');
  }
});

// buat table database jika belum ada
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS Produk (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price REAL NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS Stock (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produk_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    FOREIGN KEY (produk_id) REFERENCES Produk(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS Pembelian (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produk_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    purchase_date TEXT NOT NULL DEFAULT (datetime('now')),
    canceled INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (produk_id) REFERENCES Produk(id)
  )`);
});

// Routes

// daftar produk dan stok
app.get('/', (req, res) => {
  const query = `
    SELECT Produk.id, Produk.name, Produk.price, Stock.quantity
    FROM Produk
    LEFT JOIN Stock ON Produk.id = Stock.produk_id
  `;
  db.all(query, [], (err, rows) => {
    if (err) {
      return res.status(500).send('Database error');
    }
    res.render('index', { products: rows });
  });
});

// tampilkan form untuk menambah produk
app.get('/product/add', (req, res) => {
  res.render('add_product');
});

// tangani penambahan produk
app.post('/product/add', (req, res) => {
  const { name, price, stock } = req.body;
  const priceNum = parseFloat(price);
  const stockNum = parseInt(stock);
  if (!name || isNaN(priceNum) || priceNum <= 0 || isNaN(stockNum) || stockNum < 0) {
    return res.status(400).send('Invalid input');
  }

  db.run('INSERT INTO Produk (name, price) VALUES (?, ?)', [name, priceNum], function(err) {
    if (err) {
      return res.status(500).send('Database error');
    }
    const produkId = this.lastID;
    db.run('INSERT INTO Stock (produk_id, quantity) VALUES (?, ?)', [produkId, stockNum], (err) => {
      if (err) {
        return res.status(500).send('Database error');
      }
      res.redirect('/');
    });
  });
});

// New route: list products with edit and delete buttons
app.get('/products', (req, res) => {
  const query = `
    SELECT Produk.id, Produk.name, Produk.price, Stock.quantity
    FROM Produk
    LEFT JOIN Stock ON Produk.id = Stock.produk_id
  `;
  db.all(query, [], (err, rows) => {
    if (err) {
      return res.status(500).send('Database error');
    }
    res.render('products', { products: rows });
  });
});

// Reuse add product form route with new path
app.get('/products/add', (req, res) => {
  res.render('add_product');
});

// Reuse add product POST handler with new path
app.post('/products/add', (req, res) => {
  const { name, price, stock } = req.body;
  const priceNum = parseFloat(price);
  const stockNum = parseInt(stock);
  if (!name || isNaN(priceNum) || priceNum <= 0 || isNaN(stockNum) || stockNum < 0) {
    return res.status(400).send('Invalid input');
  }

  db.run('INSERT INTO Produk (name, price) VALUES (?, ?)', [name, priceNum], function(err) {
    if (err) {
      return res.status(500).send('Database error');
    }
    const produkId = this.lastID;
    db.run('INSERT INTO Stock (produk_id, quantity) VALUES (?, ?)', [produkId, stockNum], (err) => {
      if (err) {
        return res.status(500).send('Database error');
      }
      res.redirect('/products');
    });
  });
});

// GET edit product form
app.get('/products/edit/:id', (req, res) => {
  const productId = req.params.id;
  const query = `
    SELECT Produk.id, Produk.name, Produk.price, Stock.quantity
    FROM Produk
    LEFT JOIN Stock ON Produk.id = Stock.produk_id
    WHERE Produk.id = ?
  `;
  db.get(query, [productId], (err, row) => {
    if (err) {
      return res.status(500).send('Database error');
    }
    if (!row) {
      return res.status(404).send('Product not found');
    }
    res.render('edit_product', { product: row });
  });
});

// POST edit product form handler
app.post('/products/edit/:id', (req, res) => {
  const productId = req.params.id;
  const { name, price, stock } = req.body;
  const priceNum = parseFloat(price);
  const stockNum = parseInt(stock);
  if (!name || isNaN(priceNum) || priceNum <= 0 || isNaN(stockNum) || stockNum < 0) {
    return res.status(400).send('Invalid input');
  }

  db.run('UPDATE Produk SET name = ?, price = ? WHERE id = ?', [name, priceNum, productId], function(err) {
    if (err) {
      return res.status(500).send('Database error');
    }
    db.run('UPDATE Stock SET quantity = ? WHERE produk_id = ?', [stockNum, productId], function(err) {
      if (err) {
        return res.status(500).send('Database error');
      }
      res.redirect('/products');
    });
  });
});

// POST delete product handler
app.post('/products/delete/:id', (req, res) => {
  const productId = req.params.id;
  // Delete stock first due to foreign key constraint
  db.run('DELETE FROM Stock WHERE produk_id = ?', [productId], function(err) {
    if (err) {
      return res.status(500).send('Database error');
    }
    db.run('DELETE FROM Produk WHERE id = ?', [productId], function(err) {
      if (err) {
        return res.status(500).send('Database error');
      }
      res.redirect('/products');
    });
  });
});

//  tampilkan form untuk pembelian produk
app.get('/purchase', (req, res) => {
  db.all('SELECT * FROM Produk', [], (err, products) => {
    if (err) {
      return res.status(500).send('Database error');
    }
    res.render('purchase', { products });
  });
});

// tangani pembelian produk
app.post('/purchase', (req, res) => {
  const { produk_id, quantity } = req.body;
  const qty = parseInt(quantity);
  if (!produk_id || isNaN(qty) || qty <= 0) {
    return res.status(400).send('Invalid input');
  }

  // lihat stok produk
  db.get('SELECT quantity FROM Stock WHERE produk_id = ?', [produk_id], (err, row) => {
    if (err) {
      return res.status(500).send('Database error');
    }
    const stockQty = row ? row.quantity : 0;
    if (stockQty < qty) {
      return res.status(400).send('Not enough stock');
    }

    // insert pembelian
    db.run('INSERT INTO Pembelian (produk_id, quantity) VALUES (?, ?)', [produk_id, qty], function(err) {
      if (err) {
        return res.status(500).send('Database error');
      }

      // update stok
      db.run('UPDATE Stock SET quantity = quantity - ? WHERE produk_id = ?', [qty, produk_id], (err) => {
        if (err) {
          return res.status(500).send('Database error');
        }
        res.redirect('/purchases');
      });
    });
  });
});

// daftar pembelian
app.get('/purchases', (req, res) => {
  const query = `
    SELECT Pembelian.id, Produk.name, Pembelian.quantity, Pembelian.purchase_date, Pembelian.canceled
    FROM Pembelian
    JOIN Produk ON Pembelian.produk_id = Produk.id
    ORDER BY Pembelian.purchase_date DESC
  `;
  db.all(query, [], (err, purchases) => {
    if (err) {
      return res.status(500).send('Database error');
    }
    res.render('purchases', { purchases });
  });
});

// cancel pembelian
app.post('/cancel/:id', (req, res) => {
  const purchaseId = req.params.id;
  // periksa apakah ada pembelian
  db.get('SELECT produk_id, quantity, canceled FROM Pembelian WHERE id = ?', [purchaseId], (err, row) => {
    if (err) {
      return res.status(500).send('Database error');
    }
    if (!row) {
      return res.status(404).send('Purchase not found');
    }
    if (row.canceled) {
      return res.status(400).send('Purchase already canceled');
    }

    //  Update pembelian dibatalkan
    db.run('UPDATE Pembelian SET canceled = 1 WHERE id = ?', [purchaseId], (err) => {
      if (err) {
        return res.status(500).send('Database error');
      }

      // Update stok produk 
      db.run('UPDATE Stock SET quantity = quantity + ? WHERE produk_id = ?', [row.quantity, row.produk_id], (err) => {
        if (err) {
          return res.status(500).send('Database error');
        }
        res.redirect('/purchases');
      });
    });
  });
});

// Seed 10 products and stock if empty
function seedProducts() {
  db.get('SELECT COUNT(*) as count FROM Produk', (err, row) => {
    if (err) {
      console.error('Error checking Produk count', err.message);
      return;
    }
    if (row.count === 0) {
      const products = [
        { name: 'Produk 1', price: 10000 },
        { name: 'Produk 2', price: 20000 },
        { name: 'Produk 3', price: 30000 },
        { name: 'Produk 4', price: 40000 },
        { name: 'Produk 5', price: 50000 },
        { name: 'Produk 6', price: 60000 },
        { name: 'Produk 7', price: 70000 },
        { name: 'Produk 8', price: 80000 },
        { name: 'Produk 9', price: 90000 },
        { name: 'Produk 10', price: 100000 }
      ];
      const insertProduct = db.prepare('INSERT INTO Produk (name, price) VALUES (?, ?)');
      const insertStock = db.prepare('INSERT INTO Stock (produk_id, quantity) VALUES (?, ?)');
      products.forEach((p, index) => {
        insertProduct.run(p.name, p.price, function(err) {
          if (err) {
            console.error('Error inserting product', err.message);
          } else {
            insertStock.run(this.lastID, 100, function(err) {
              if (err) {
                console.error('Error inserting stock', err.message);
              }
            });
          }
        });
      });
      insertProduct.finalize();
      insertStock.finalize();
    }
  });
}

seedProducts();

// Function to add stock for a product
function addStock(produkId, quantity) {
  if (!produkId || isNaN(quantity) || quantity <= 0) {
    console.error('Invalid input for addStock');
    return;
  }
  db.get('SELECT quantity FROM Stock WHERE produk_id = ?', [produkId], (err, row) => {
    if (err) {
      console.error('Database error in addStock:', err.message);
      return;
    }
    if (row) {
      // Update existing stock quantity
      const newQuantity = row.quantity + quantity;
      db.run('UPDATE Stock SET quantity = ? WHERE produk_id = ?', [newQuantity, produkId], (err) => {
        if (err) {
          console.error('Error updating stock:', err.message);
        } else {
          console.log(`Stock updated for produk_id ${produkId}. New quantity: ${newQuantity}`);
        }
      });
    } else {
      // Insert new stock record if none exists
      db.run('INSERT INTO Stock (produk_id, quantity) VALUES (?, ?)', [produkId, quantity], (err) => {
        if (err) {
          console.error('Error inserting stock:', err.message);
        } else {
          console.log(`Stock added for produk_id ${produkId}. Quantity: ${quantity}`);
        }
      });
    }
  });
}

app.get('/stock/add', (req, res) => {
  db.all('SELECT * FROM Produk', [], (err, products) => {
    if (err) {
      return res.status(500).send('Database error');
    }
    res.render('add_stock', { products });
  });
});

app.post('/stock/add', (req, res) => {
  const { produk_id, quantity } = req.body;
  const qty = parseInt(quantity);
  if (!produk_id || isNaN(qty) || qty <= 0) {
    return res.status(400).send('Invalid input');
  }

  db.get('SELECT quantity FROM Stock WHERE produk_id = ?', [produk_id], (err, row) => {
    if (err) {
      return res.status(500).send('Database error');
    }
    if (row) {
      const newQuantity = row.quantity + qty;
      db.run('UPDATE Stock SET quantity = ? WHERE produk_id = ?', [newQuantity, produk_id], (err) => {
        if (err) {
          return res.status(500).send('Database error');
        }
        res.redirect('/');
      });
    } else {
      db.run('INSERT INTO Stock (produk_id, quantity) VALUES (?, ?)', [produk_id, qty], (err) => {
        if (err) {
          return res.status(500).send('Database error');
        }
        res.redirect('/');
      });
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
