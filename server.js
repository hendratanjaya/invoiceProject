const express = require("express");
const mysql = require("mysql");
const fs = require("fs");
const multer = require("multer");
const csv = require("csv-parser");
const path = require("path");
const bodyParser = require("body-parser");
const { title } = require("process");
const { error } = require("console");

const app = express();
app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static(path.join(__dirname,"public")));
app.use(express.json());

app.set("view engine", "ejs");
app.set("views","views");

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || "",
});

const storage = multer.diskStorage({
    destination:function(req,file,cb){
        cb(null,__dirname+"/uploads");
    },

    filename:function(req,file,cb){
        cb(null,file.originalname);
    }
})

const upload = multer({storage:storage});

function formatDate(dateString){

    const date = new Date(dateString);

    const day = String(date.getDate()).padStart(2,0);
    const month = String(date.getMonth()).padStart(2,0);
    const year = date.getFullYear();

    return `${day}-${month}-${year}`;
}

function formatToValidDate(dateString){
    const date = dateString.split(' ');
    const parts = date[0].split('-');
    const newDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
    return newDate;
}
db.connect((err)=>{
    if(err) {
        throw err;
        //console.log(err);
    }
    console.log("database connected");

    app.get("/", (req,res) =>{
        const sql = "SELECT * FROM invoice ORDER BY OrderDate ASC";
        db.query(sql,(err,result) =>{
            const invoices = JSON.parse(JSON.stringify(result));
            invoices.forEach(invoice =>{
                invoice.OrderDate = formatDate(invoice.OrderDate);
            });
            
            
            res.render("index", {invoices: invoices, title: "INVOICE"});
        });
    });   

    app.get("/search", (req,res)=>{
        const sql = `SELECT * FROM invoice WHERE ReceiptNumber LIKE ? OR OrderNumber LIKE ?`;
        const form = req.query.search_form.trim();
        if(form === "")
            return res.redirect("/");
        else{
           
            db.query(sql, [`%${form}%`, `%${form}%`], (err, result) =>{
                if (err) {
                    console.error("SQL error: " + err);
                    res.status(500).send("Internal Server Error");
                    return;
                }
    
                const invoices = JSON.parse(JSON.stringify(result));
                invoices.forEach(invoice =>{
                    invoice.OrderDate = formatDate(invoice.OrderDate);
                });
                
                
                res.render("index", {invoices: invoices, title: "INVOICE"});
    
                // if(result.length > 0 ){
                //     const order = JSON.parse(JSON.stringify(result));
                //     order.forEach(order =>{
                //         order.OrderDate = formatDate(order.OrderDate);
                //     });
                //     order.OrderDate = formatDate(order.OrderDate);
    
                //     res.render('detail',{order: order, title: `${form}`});
                // }else{
                //     res.send("No Result Found");
                // }
    
            });
        }
    })

    app.post("/upload",upload.single("file"),(req,res)=>{
        const status = req.body.marketplace;
        const marketPlace = (status === '1'? "shopee" : status === '2'? "tokopedia" :"lazada") + ".csv"; 
        const newFilePath = path.join(__dirname, 'uploads', marketPlace);
        const oldFilePath = path.join(__dirname, 'uploads', req.file.filename);
       
        fs.rename(oldFilePath, newFilePath, (err) => {
            if (err) {
                return res.status(500).send('Error renaming file.');
            } 
            
            let receipt,orderNum,orderDate,sku,quant,type;
            const insertSql = `INSERT INTO invoice (ReceiptNumber,OrderNumber,OrderDate,SkuID,Quantity,Status,ReceiptStatus,Type) VALUES (?,?,?,?,?,"belum diterima","belum diatur",?)`;
            if(status === '1'){
                
                receipt = "No. Resi";
                orderNum = "No. Pesanan";
                orderDate = "Waktu Pembayaran Dilakukan";
                sku = "Nomor Referensi SKU";
                quant = "Jumlah Produk di Pesan";
                type = "barang toko";
            }  
            else if(status === '2'){ 
                receipt = "No Resi / Kode Booking";
                orderNum = "Nomor Invoice";
                orderDate = "Tanggal Pembayaran";
                sku = "Nomor SKU";
                quant = "Jumlah Produk Dibeli";
                type = "barang toko";
            }
            
            else if(status === '3'){
                type = "barang toko";
            }else if(status === 4){

                type = "barang dropship";
            }
               
            fs.createReadStream(newFilePath).pipe(csv()).on("data", (row)=>{
                //var receipt,orderNum,orderDate,sku,quant;
                const col1 = row[receipt];
                const col2 = row[orderNum];
                let col3 = row[orderDate];
                if(status === '2'){
                    col3 = formatToValidDate(col3);
                }
                
                const col4 = row[sku];
                const col5 = row[quant];
        
                db.query(insertSql,[col1,col2,col3,col4,col5,type],(err,result)=>{
                    if(err)
                        console.log("failed insert" + err);
                    
                });
                
            }).on("end",()=>{
                fs.unlink(newFilePath,(err)=>{
                    if(err){
                        console.log("error deletin file: " + err);
                        return res.status(500).send("error, deleting file");
    
                    }
                    else{
                        //console.log("succes");
                        return res.redirect("/");
                    }
                });
    
                
            })
        });
        
        
    });

    app.post("/update-status", (req,res)=>{
        const statusUpdates = req.body.statusUpdates;
        //console.log(statusUpdates);
        const queries = statusUpdates.map(update =>{
            new Promise ((resolve,reject)=>{
                db.query("UPDATE invoice SET Status = ?, Quantity = ?, ReceiptStatus = ? WHERE Id = ?", [update.status, update.quantity, update.receiptStatus, update.id], (error, result) =>{
                    if (error) return reject(error);
                    resolve();

                });
            });
        });
9
        Promise.all(queries).then(()=>{
            res.json({success :true});

        }).catch(error =>{
            console.log("SQL Error : ", error);
            res.status(500).json({ success: false, message: "Internal Server Error"});
        });

    });
});

app.get("/detail",(req,res)=>{
    const sql = `SELECT * FROM invoice WHERE ReceiptNumber LIKE ? OR OrderNumber LIKE ?`;
    const form = req.query.invoice_form.trim();
    if(form === "")
        return res.redirect("/");
    else{
       
        db.query(sql, [`%${form}%`, `%${form}%`], (err, result) =>{
            if (err) {
                console.error("SQL error: " + err);
                res.status(500).send("Internal Server Error");
                return;
            }

            // const invoices = JSON.parse(JSON.stringify(result));
            // invoices.forEach(invoice =>{
            //     invoice.OrderDate = formatDate(invoice.OrderDate);
            // });
            
            
            //res.render("index", {invoices: invoices, title: "INVOICE"});

            if(result.length > 0 ){
                const order = JSON.parse(JSON.stringify(result));
                let status = null;
                order.forEach(order =>{
                    order.OrderDate = formatDate(order.OrderDate);
                    if(status === null){
                        status = order.ReceiptStatus;
                    }
                });
                order.OrderDate = formatDate(order.OrderDate);

                res.render('detail',{order: order, title: `${form}`, status: status});
            }else{
                res.send("No Result Found");
            }

        });
    }
    
});

// app.post("/process",(req,res)=>{
//     const form = req.body.invoiceDetail;
//     const action = req.body.action;
//     if(form.trim() === "")
//         return res.redirect("/");

//     else{

//         var actionQuery = '';
//         if(action === "delete"){
           
            
//             actionQuery = "DELETE FROM invoice WHERE Id = ? OR ReceiptNumber = ? OR OrderNumber = ?"
//             db.query(actionQuery,[`${form}`, `${form}`,`${form}`], (err,result)=>{
//                 if(err){
//                     console.error("SQL error: " + err);
//                     res.status(500).send("Internal Server Error");
//                     return;
//                 }

                
//             })

//         }else if(action === "accepted"){

//             actionQuery = "UPDATE invoice SET Status = 'diterima' WHERE Id = ? OR ReceiptNumber = ? OR OrderNumber = ?"
//             db.query(actionQuery,[`${form}`, `${form}`,`${form}`], (err,result)=>{
//                 if(err){
//                     console.error("SQL error: " + err);
//                     res.status(500).send("Internal Server Error");
//                     return;
//                 }
                
                
//             })
//         }else if(action === "incomplete"){
//             actionQuery = "UPDATE invoice SET Status = 'tidak lengkap' WHERE Id = ? OR ReceiptNumber = ? OR OrderNumber = ?"
//             db.query(actionQuery,[`${form}`, `${form}`,`${form}`], (err,result)=>{
//                 if(err){
//                     console.error("SQL error: " + err);
//                     res.status(500).send("Internal Server Error");
//                     return;
//                 }

                
//             })
//         }else if(action === "unaccepted"){

//             actionQuery = "UPDATE invoice SET Status = 'belum diterima' WHERE Id = ? OR ReceiptNumber = ? OR OrderNumber = ?"
//             db.query(actionQuery,[`${form}`, `${form}`,`${form}`], (err,result)=>{
//                 if(err){
//                     console.error("SQL error: " + err);
//                     res.status(500).send("Internal Server Error");
//                     return;
//                 }

                
//             })

//         }

//         return res.redirect("/");


//     }
// })

app.get("/export",(req,res)=>{

    const sql = "SELECT * FROM invoice WHERE 1";
        db.query(sql,(err,result) =>{
            const invoices = JSON.parse(JSON.stringify(result));
            let received = 0, notReceived = 0, incomplete = 0, total = invoices.length;
            invoices.forEach(invoice =>{
                
                invoice.OrderDate = formatDate(invoice.OrderDate);
                switch(invoice.Status){
                    case "diterima":received++; break;
                    case "tidak lengkap": incomplete++; break;
                    case "belum diterima": notReceived++; break;
                }
            });
            
            
            res.render("export", {invoices:invoices,received:received,notReceived:notReceived,incomplete:incomplete,total:total,title: "Export Data"});
        });
    
})

app.get("/export-data", (req,res)=>{
    const type = req.query.type;
    const status = req.query.status;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    console.log("Type:", type);
    console.log("Status:", status);
    console.log("Start Date:", startDate);
    console.log("End Date:", endDate);

    // let sqlQuery = "";

    // if(startDate === "" || endDate === "" )

    const sqlQuery = "SELECT * FROM invoice WHERE Type = ? AND Status = ? AND (OrderDate BETWEEN ? AND ?)"

    db.query(sqlQuery, [`${type}`,`${status}`,`${startDate}`,`${endDate}`],(err,result) =>{
        const invoices = JSON.parse(JSON.stringify(result));
        let received = 0, notReceived = 0, incomplete = 0, total = invoices.length;
        invoices.forEach(invoice =>{
            invoice.OrderDate = formatDate(invoice.OrderDate);

            switch(invoice.Status){
                case "diterima":received++; break;
                case "tidak lengkap": incomplete++; break;
                case "belum diterima": notReceived++; break;
            }
        });
        
        
        res.render("export", {invoices:invoices,received:received,notReceived:notReceived,incomplete:incomplete,total:total,title: "Export Data"});
    });

})

app.get("/incomplete",(req,res) =>{

    
    const query = "SELECT OrderNumber, ReceiptStatus, Type FROM invoice WHERE ReceiptStatus = ? OR ReceiptStatus = ? GROUP BY OrderNumber, ReceiptStatus, Type ";
    
    db.query(query, ["tidak lengkap" , "belum diterima"], (err,result) =>{
        if (err) {
            console.error("SQL error: " + err);
            res.status(500).send("Internal Server Error");
            return;
        }
        const invoices = JSON.parse(JSON.stringify(result));
        //console.log(invoices);
        res.render("incomplete",{invoices:invoices, title:"Pesanan Tertukar dan Tidak Lengkap"});
        

    })
    

})

app.listen(3000, () =>{
    console.log("Server readyy");
});