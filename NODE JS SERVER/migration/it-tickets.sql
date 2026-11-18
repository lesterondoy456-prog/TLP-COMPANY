SET XACT_ABORT ON;

-- Separate IT identities. Initial administrators are provisioned explicitly;
-- migrations never create accounts or ship a default password.
IF OBJECT_ID(N'dbo.ITTicketUserLogin',N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ITTicketUserLogin (
    id INT IDENTITY PRIMARY KEY,name NVARCHAR(MAX) NOT NULL,username NVARCHAR(80) NOT NULL,
    cpnumber NVARCHAR(MAX) NULL,email NVARCHAR(MAX) NULL,photo NVARCHAR(MAX) NULL,
    role NVARCHAR(MAX) NOT NULL,passwordHash VARCHAR(MAX) NOT NULL,isActive BIT NOT NULL,
    createdAt DATETIME2 NOT NULL,updatedAt DATETIME2 NOT NULL,
    CONSTRAINT UQ_ITTicketUserLogin_Username UNIQUE(username)
  );
END;

IF OBJECT_ID(N'dbo.ITTickets',N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ITTickets (
    id INT IDENTITY PRIMARY KEY,number VARCHAR(30) NULL,
    ownerSystem NVARCHAR(20) NOT NULL,ownerId INT NOT NULL,ownerName NVARCHAR(MAX) NOT NULL,
    requestKey CHAR(32) NOT NULL,requestHash CHAR(64) NOT NULL,
    category NVARCHAR(MAX) NOT NULL,note NVARCHAR(MAX) NOT NULL,status NVARCHAR(MAX) NOT NULL,
    version INT NOT NULL,createdAt DATETIME2 NOT NULL,updatedAt DATETIME2 NOT NULL,
    CONSTRAINT UQ_ITTickets_OwnerRequest UNIQUE(ownerSystem,ownerId,requestKey)
  );
  CREATE UNIQUE INDEX UQ_ITTickets_Number ON dbo.ITTickets(number) WHERE number IS NOT NULL;
  CREATE INDEX IX_ITTickets_Owner ON dbo.ITTickets(ownerSystem,ownerId,id);
END;

IF OBJECT_ID(N'dbo.ITTicketHistory',N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ITTicketHistory (
    id INT IDENTITY PRIMARY KEY,ticketId INT NOT NULL,kind NVARCHAR(MAX) NOT NULL,
    status NVARCHAR(MAX) NOT NULL,note NVARCHAR(MAX) NOT NULL,targetHistoryId INT NULL,
    actorSystem NVARCHAR(MAX) NOT NULL,actorId INT NOT NULL,actorName NVARCHAR(MAX) NOT NULL,
    createdAt DATETIME2 NOT NULL,
    CONSTRAINT FK_ITTicketHistory_Ticket FOREIGN KEY(ticketId) REFERENCES dbo.ITTickets(id),
    CONSTRAINT FK_ITTicketHistory_Target FOREIGN KEY(targetHistoryId) REFERENCES dbo.ITTicketHistory(id)
  );
  CREATE INDEX IX_ITTicketHistory_Ticket ON dbo.ITTicketHistory(ticketId,id);
END;

IF OBJECT_ID(N'dbo.ITTicketAttachments',N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ITTicketAttachments (
    id INT IDENTITY PRIMARY KEY,ticketId INT NOT NULL,name NVARCHAR(MAX) NOT NULL,
    type NVARCHAR(MAX) NOT NULL,bytes INT NOT NULL,data VARBINARY(MAX) NOT NULL,
    sha256 CHAR(64) NOT NULL,createdAt DATETIME2 NOT NULL,
    CONSTRAINT FK_ITTicketAttachments_Ticket FOREIGN KEY(ticketId) REFERENCES dbo.ITTickets(id)
  );
  CREATE INDEX IX_ITTicketAttachments_Ticket ON dbo.ITTicketAttachments(ticketId,id);
END;
