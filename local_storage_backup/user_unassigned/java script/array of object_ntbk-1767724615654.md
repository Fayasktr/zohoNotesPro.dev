# array of object

*ID: `ntbk-1767724615654` | Folder: `java script` | Updated: 2026-01-07T17:18:20.829Z*

---

### Cell 1 (code: javascript)
```javascript
const users = [
  { id: 1, name: "Ameen", age: 21, active: true },
  { id: 2, name: "Rafi", age: 17, active: false },
  { id: 3, name: "Fayas", age: 23, active: true },
  { id: 4, name: "Niyas", age: 16, active: true },
  { id: 5, name: "Salman", age: 30, active: false }
];

let arr=[];
for(let val of users){
    if(val.active ==true && val.age > 18){
        arr.push(val.name)
    }
}

console.log(arr)
```

**Output:**
```
[
  "Ameen",
  "Fayas"
]
```

### Cell 2 (code: javascript)
```javascript
const employees = [
  { id: 1, name: "Asha", dept: "IT", salary: 50000 },
  { id: 2, name: "Rahul", dept: "HR", salary: 40000 },
  { id: 3, name: "Anu", dept: "IT", salary: 60000 },
  { id: 4, name: "Vishnu", dept: "HR", salary: 45000 },
  { id: 5, name: "Kiran", dept: "IT", salary: 55000 }
];

let obj={}

for(let val of employees){
    let dept=val.dept;
    if(!obj[dept]){
        obj[dept]=0;
    }
    let total=val.salary
    total=Number(total)
    obj[dept]=obj[dept]+total
}
console.log(obj)


```

**Output:**
```
{
  "IT": 165000,
  "HR": 85000
}
```

### Cell 3 (code: javascript)
```javascript
console.log('fayas')
```

**Output:**
```
fayas
```

### Cell 4 (code: javascript)
```javascript

```

